"""Deal win-probability and close-date model for the HubSpot pipeline.

Training data are monthly snapshots of every deal while it was open, rebuilt from property
history, labelled with the deal's final outcome. Only deals that had closed by `as_of` are
used, and features only use what HubSpot showed at the snapshot date.
"""

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import brier_score_loss, roc_auc_score
from sklearn.model_selection import GroupKFold
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

from data import Raw, deal_state_at

STAGE_ORDER = {"appointmentscheduled": 0, "qualifiedtobuy": 1, "presentationscheduled": 2,
               "decisionmakerboughtin": 3, "contractsent": 4}
FEATURES = {
    "stage_idx": "Later pipeline stage",
    "days_in_stage": "Days in current stage",
    "pushes": "Close date pushed",
    "overdue": "Close date already passed",
    "activity_30d": "Activity in last 30 days",
    "meetings_60d": "Meetings in last 60 days",
    "days_since_activity": "Days since last activity",
    "contacts": "Contacts engaged",
    "src_partner": "Partner referral",
    "src_outbound": "Outbound (SDR) sourced",
    "log_amount": "Deal size",
}


def featurize(d: pd.DataFrame, when) -> pd.DataFrame:
    d = d.copy()
    d["stage_idx"] = d["stage_at"].map(STAGE_ORDER)
    d["days_in_stage"] = (when - d["stage_since"]).dt.days.clip(lower=0)
    d["deal_age"] = (when - d["createdate"]).dt.days
    d["overdue"] = (d["closedate_at"] < when).astype(int)
    d["days_since_activity"] = (when - d["last_activity_at"]).dt.days.fillna(d["deal_age"]).clip(upper=180)
    d["contacts"] = d["num_associated_contacts"].fillna(1)
    d["src_pql"] = (d["lead_source"] == "self_serve_expansion").astype(int)
    d["src_partner"] = (d["lead_source"] == "partner_referral").astype(int)
    d["src_outbound"] = (d["lead_source"] == "outbound_sdr").astype(int)
    d["log_amount"] = np.log(d["amount_in_home_currency"])
    d["hubspot_prob"] = d["stage_idx"].map({0: 0.1, 1: 0.2, 2: 0.4, 3: 0.6, 4: 0.8})
    return d


def snapshots(raw: Raw, as_of) -> pd.DataFrame:
    """Monthly open-deal snapshots with known final outcomes (closed by as_of)."""
    closed = raw.deals[(raw.deals["hs_is_closed"] == 1) & (raw.deals["closedate"] <= as_of)]
    outcome = closed.set_index("hs_object_id")["hs_is_closed_won"]
    close_at = closed.set_index("hs_object_id")["closedate"]
    rows = []
    for when in pd.date_range("2023-01-31", as_of, freq="ME"):
        st = deal_state_at(raw, when)
        st = st[st["is_open_at"] & st["hs_object_id"].isin(outcome.index)]
        if len(st):
            f = featurize(st, when)
            f["snapshot"] = when
            rows.append(f)
    s = pd.concat(rows, ignore_index=True)
    s["won"] = s["hs_object_id"].map(outcome)
    s["closed_at"] = s["hs_object_id"].map(close_at)
    return s


class DealModel:
    def __init__(self, C=0.05):  # strong regularisation: ~90 deals, ~15 wins
        self.model = make_pipeline(StandardScaler(), LogisticRegression(C=C, max_iter=2000))

    def fit(self, snaps):
        self.model.fit(snaps[list(FEATURES)], snaps["won"])
        # Slip: how far past the rep's close date won deals actually closed.
        won = snaps[snaps["won"] == 1]
        self.slip_days = ((won["closed_at"] - won["closedate_at"]).dt.days).to_numpy()
        self.cycle_days = ((won.groupby("hs_object_id")["closed_at"].first()
                            - won.groupby("hs_object_id")["createdate"].first()).dt.days).to_numpy()
        return self

    def predict(self, rows):
        return np.clip(self.model.predict_proba(rows[list(FEATURES)])[:, 1], 0.02, 0.95)

    def drivers(self):
        lr = self.model[-1]
        scale = self.model[0].scale_
        out = []
        for f, coef in zip(FEATURES, lr.coef_[0]):
            out.append(dict(feature=f, label=FEATURES[f], oddsRatio=round(float(np.exp(coef)), 3),  # per 1 SD
                            direction="protective" if coef > 0 else "risk"))
        return sorted(out, key=lambda d: -abs(np.log(d["oddsRatio"])))


def cross_validate(snaps, folds=5):
    p = np.zeros(len(snaps))
    for tr, te in GroupKFold(folds).split(snaps, groups=snaps["hs_object_id"]):
        p[te] = DealModel().fit(snaps.iloc[tr]).predict(snaps.iloc[te])
    y = snaps["won"]
    stage_cal = []
    for k, g in snaps.assign(p=p).groupby("stage_idx"):
        stage_cal.append(dict(stage=int(k), hubspotProb=float(g["hubspot_prob"].iloc[0]),
                              empiricalProb=round(float(g["won"].mean()), 3), modelProb=round(float(g["p"].mean()), 3),
                              n=int(len(g))))
    return dict(auc=float(roc_auc_score(y, p)), brierModel=float(brier_score_loss(y, p)),
                brierHubspot=float(brier_score_loss(y, snaps["hubspot_prob"])), stageCalibration=stage_cal)


def open_deals(raw: Raw, as_of) -> pd.DataFrame:
    st = deal_state_at(raw, as_of)
    return featurize(st[st["is_open_at"]], as_of)
