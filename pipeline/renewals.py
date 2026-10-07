"""Renewal models.

Self-serve: logistic regression on renewal decisions, using only signals visible in Stripe
before the period ends (plan, tenure, seats, seat changes, failed or late payments,
acquisition channel). Scheduled cancellations are not used for training (they are the
outcome, not a predictor) but are applied when scoring: a customer who already pressed
"cancel" will not renew.

Enterprise: too few renewal decisions for a statistical model, so a transparent rule
calibrated on history with a Beta prior: did the customer pay its current term late?
"""

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score

from data import Raw

FEATURES = {
    "plan_12m": "12-month plan (vs 6-month)",
    "tenure_2plus": "Renewed at least once before",
    "multi_seat": "Team license (2+ seats)",
    "seat_down_last": "Seat reduction at last renewal",
    "seat_up_last": "Seat expansion at last renewal",
    "failed_payment": "Failed payment on current term",
    "paid_late": "Invoice paid after due date",
    "invoice_billed": "Pays by invoice",
    "persona_it_lead": "Buyer: IT lead",
    "channel_paid": "Acquired via paid search",
    "channel_referral": "Acquired via referral / word of mouth",
}
SCHEDULED_CANCEL_P = 0.03


def term_features(terms: pd.DataFrame, raw: Raw, as_of) -> pd.DataFrame:
    """Feature row per billed self-serve period, using information known by min(period_end, as_of)."""
    t = terms[(terms["segment"] == "self_serve") & ~terms["refunded"]].sort_values(["subscription_id", "period_start"]).copy()
    t["term_no"] = t.groupby("subscription_id").cumcount() + 1
    t["prev_qty"] = t.groupby("subscription_id")["quantity"].shift(1)
    t["next_start"] = t.groupby("subscription_id")["period_start"].shift(-1)

    ch = raw.charges[raw.charges["created"] <= as_of]
    failed = ch[ch["status"] == "failed"].groupby("invoice_id").size()
    t["failed_payment"] = t["invoice_id"].map(failed).fillna(0).gt(0).astype(int)
    late_days = (t["paid_at"].where(t["paid_at"] <= as_of) - t["due_date"]).dt.days
    unpaid_overdue = t["due_date"].notna() & (t["paid_at"].isna() | (t["paid_at"] > as_of)) & (t["due_date"] < as_of)
    t["paid_late"] = ((late_days > 0) | unpaid_overdue).astype(int)
    t["days_late"] = late_days.clip(lower=0).fillna(0)

    cust = raw.customers.set_index("id")
    t["persona"] = t["customer_id"].map(cust["persona"])
    t["channel"] = t["customer_id"].map(cust["acquisition_channel"])
    t["plan_12m"] = (t["months"] == 12).astype(int)
    t["tenure_2plus"] = (t["term_no"] >= 2).astype(int)
    t["multi_seat"] = (t["quantity"] >= 2).astype(int)
    t["seat_down_last"] = (t["quantity"] < t["prev_qty"]).astype(int)
    t["seat_up_last"] = (t["quantity"] > t["prev_qty"]).astype(int)
    t["invoice_billed"] = (t["collection_method"] == "send_invoice").astype(int)
    t["persona_it_lead"] = (t["persona"] == "it_lead").astype(int)
    t["channel_paid"] = (t["channel"] == "paid_search").astype(int)
    t["channel_referral"] = t["channel"].isin(["partner_referral", "word_of_mouth"]).astype(int)

    subs = raw.subscriptions.set_index("id")
    sched = (subs["cancel_at_period_end"] == 1) & (subs["canceled_at"] <= as_of)
    t["scheduled_cancel"] = t["subscription_id"].map(sched).fillna(False).astype(bool)
    return t


def renewal_events(feat: pd.DataFrame, as_of) -> pd.DataFrame:
    """Periods whose end is known by as_of, labelled renewed / churned."""
    ev = feat[(feat["period_end"] <= as_of) & feat["valid"]].copy()
    nxt_valid = feat.groupby("subscription_id")["valid"].shift(-1).reindex(ev.index)
    ev["renewed"] = (ev["next_start"].notna() & ((ev["next_start"] - ev["period_end"]).abs() < pd.Timedelta(days=3))
                     & (nxt_valid == True)).astype(int)  # a renewal that was never paid is churn
    return ev


class SelfServeRenewalModel:
    def __init__(self, C=1.0):
        self.model = LogisticRegression(C=C, max_iter=2000)

    def fit(self, events: pd.DataFrame):
        self.model.fit(events[list(FEATURES)], events["renewed"])
        self.base_rate = events["renewed"].mean()
        return self

    def predict(self, rows: pd.DataFrame) -> np.ndarray:
        p = self.model.predict_proba(rows[list(FEATURES)])[:, 1]
        if "scheduled_cancel" in rows:
            p = np.where(rows["scheduled_cancel"], SCHEDULED_CANCEL_P, p)
        return p

    def drivers(self):
        out = []
        for f, coef in zip(FEATURES, self.model.coef_[0]):
            out.append(dict(feature=f, label=FEATURES[f], oddsRatio=round(float(np.exp(coef)), 3),
                            direction="protective" if coef > 0 else "risk"))
        return sorted(out, key=lambda d: -abs(np.log(d["oddsRatio"])))


def evaluate_out_of_time(events: pd.DataFrame, split):
    train, test = events[events["period_end"] < split], events[events["period_end"] >= split]
    m = SelfServeRenewalModel().fit(train)
    p = m.predict(test.drop(columns=["scheduled_cancel"]))
    auc = roc_auc_score(test["renewed"], p)
    test = test.assign(p=p)
    test["bucket"] = pd.qcut(test["p"], 5, duplicates="drop")
    calib = [dict(bucket=f"{iv.left:.0%}–{iv.right:.0%}", predicted=round(float(g["p"].mean()), 3),
                  actual=round(float(g["renewed"].mean()), 3), n=int(len(g)))
             for iv, g in test.groupby("bucket", observed=True)]
    churn = 1 - test["renewed"]
    top = test["p"] <= test["p"].quantile(0.1)
    lift = dict(topDecileChurn=round(float(churn[top].mean()), 3), avgChurn=round(float(churn.mean()), 3))
    return dict(auc=float(auc), calibration=calib, lift=lift, n_test=len(test))


# ---------------------------------------------------------------------------
# Enterprise
# ---------------------------------------------------------------------------
LATE_GRACE_DAYS = 10
PRIOR = (4.0, 1.0)  # Beta prior on renewal: ~80 %


def enterprise_renewal_rates(terms: pd.DataFrame, as_of):
    """Renewal rate on-time vs late payers among enterprise decisions known at as_of."""
    t = terms[(terms["segment"] == "enterprise") & (terms["period_end"] <= as_of)].sort_values("period_start").copy()
    nxt = terms[terms["segment"] == "enterprise"].groupby("subscription_id")["period_start"].apply(set)
    t["renewed"] = [any(abs((s - pe).days) < 3 for s in nxt.get(sid, [])) for sid, pe in zip(t["subscription_id"], t["period_end"])]
    t["late"] = (t["paid_at"] - t["due_date"]).dt.days > LATE_GRACE_DAYS
    rates = {}
    for late in (False, True):
        g = t[t["late"] == late]
        rates[late] = (g["renewed"].sum() + PRIOR[0]) / (len(g) + sum(PRIOR))
    uplift = []
    for sid, g in terms[terms["segment"] == "enterprise"].sort_values("period_start").groupby("subscription_id"):
        a = g["amount_eur"].values
        uplift += [a[i + 1] / a[i] - 1 for i in range(len(a) - 1) if g["period_start"].iloc[i + 1] <= as_of]
    return rates, (float(np.mean(uplift)) if uplift else 0.08), t
