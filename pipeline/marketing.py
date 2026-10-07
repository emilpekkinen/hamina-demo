"""Paid marketing → new revenue.

1. Lag scan: correlation of detrended monthly spend with detrended outcomes 0–9 months later
   (self-serve new bookings, enterprise deals created, enterprise new ARR won).
2. Marketing mix model (self-serve): new bookings ~ trend + seasonality + β · adstock(total paid spend),
   β ≥ 0, adstock decay picked by time-series cross-validation. Per-channel splits were tried and
   rejected: always-on search barely varies and bursty LinkedIn flights coincide with seasonal peaks,
   so channel credit was unstable (classic MMM confounding) → channel split needs holdout tests.
3. Enterprise: deals created ~ trend + β · adstock(LinkedIn + search, lagged), then
   deals → ARR via historical win rate and deal size.
Both segments share growth with spend, so everything is detrended first; with ~45 months of
data these are directional estimates, to be confirmed with holdout / lift tests.
"""

import sqlite3

import numpy as np
import pandas as pd
from sklearn.linear_model import Ridge

from data import ROOT, Raw

MKT_DB = ROOT / "data" / "marketing" / "hamina_marketing.db"
LABELS = {"google_ads": "Google Ads", "linkedin_ads": "LinkedIn Ads", "meta_ads": "Meta Ads",
          "review_sites": "Capterra / G2", "youtube_ads": "YouTube Ads", "reddit_ads": "Reddit Ads"}
CHANNELS = list(LABELS)
START = "2023-01"  # first full year with more than one channel


def load_marketing():
    con = sqlite3.connect(MKT_DB)
    weekly = pd.read_sql("SELECT * FROM campaign_weekly_stats", con, parse_dates=["week_start"])
    campaigns = pd.read_sql("SELECT * FROM campaigns", con)
    con.close()
    return weekly, campaigns


def adstock(x, decay):
    out, carry = np.zeros(len(x)), 0.0
    for i, v in enumerate(x):
        carry = v + decay * carry
        out[i] = carry
    return out


def detrend(y):
    t = np.arange(len(y))
    ly = np.log1p(np.asarray(y, float))
    return ly - np.polyval(np.polyfit(t, ly, 1), t)


def outcomes(raw: Raw, months):
    t = raw.terms
    new_ss = t[(t["segment"] == "self_serve") & (t["billing_reason"] == "subscription_create")]
    ss = new_ss.groupby(new_ss["invoiced_at"].dt.to_period("M"))["amount_eur"].sum()
    d = raw.deals
    created = d.groupby(d["createdate"].dt.to_period("M")).size()
    pipe = d.groupby(d["createdate"].dt.to_period("M"))["amount_in_home_currency"].sum()
    won = d[d["hs_is_closed_won"] == 1]
    won_arr = won.groupby(won["closedate"].dt.to_period("M"))["amount_in_home_currency"].sum()
    f = lambda s: s.reindex(months, fill_value=0).astype(float)
    return pd.DataFrame({"newSelfServe": f(ss), "dealsCreated": f(created), "pipelineCreated": f(pipe),
                         "newEnterpriseArr": f(won_arr)}, index=months)


def fit_mmm(spend: pd.DataFrame, y: np.ndarray, cols=("total",)):
    """Positive ridge on adstocked channel spend + trend + annual seasonality; decay by rolling-origin CV."""
    n = len(y)
    t = np.arange(n)
    season = np.column_stack([np.sin(2 * np.pi * spend.index.month / 12), np.cos(2 * np.pi * spend.index.month / 12)])
    best = None
    for decay in [0.0, 0.2, 0.35, 0.5, 0.65, 0.8]:
        X_ads = np.column_stack([adstock(spend[c].to_numpy(), decay) for c in cols]) / 1000  # per €1k
        X = np.column_stack([t, season, X_ads])
        errs = []
        for cut in range(n - 12, n, 3):  # rolling origin, 3-month steps over the last year
            m = Ridge(alpha=1.0, positive=True).fit(X[:cut], y[:cut])
            pred = m.predict(X[cut:cut + 3])
            errs.append(np.mean(np.abs(pred - y[cut:cut + 3])))
        score = float(np.mean(errs))
        if best is None or score < best[0]:
            best = (score, decay)
    decay = best[1]
    X_ads = np.column_stack([adstock(spend[c].to_numpy(), decay) for c in cols]) / 1000
    X = np.column_stack([t, season, X_ads])
    model = Ridge(alpha=1.0, positive=True).fit(X, y)
    coefs = model.coef_[3:]
    contrib = X_ads * coefs  # per month per channel
    fitted = model.predict(X)
    r2 = 1 - np.sum((y - fitted) ** 2) / np.sum((y - y.mean()) ** 2)
    return dict(decay=decay, coefs=coefs, contrib=contrib, fitted=fitted, r2=float(r2), mae=best[0])


def analyse(raw: Raw, as_of):
    weekly, campaigns = load_marketing()
    weekly = weekly[weekly["week_start"] <= as_of]
    months = pd.period_range("2022-01", pd.Timestamp(as_of).strftime("%Y-%m"), freq="M")
    sp = weekly.pivot_table(index=weekly["week_start"].dt.to_period("M"), columns="platform", values="spend_eur",
                            aggfunc="sum").reindex(index=months, columns=CHANNELS, fill_value=0).fillna(0)
    out = outcomes(raw, months)
    win = sp.index >= pd.Period(START)
    spw, outw = sp[win], out[win]
    total = spw.sum(axis=1).to_numpy()

    # ---- lag scan ------------------------------------------------------------------------
    ent_spend = (spw["linkedin_ads"] + 0.5 * spw["google_ads"]).to_numpy()
    lag_rows = []
    xs, xe = detrend(total), detrend(ent_spend)
    ys = {k: detrend(outw[k].to_numpy()) for k in ["newSelfServe", "dealsCreated", "newEnterpriseArr"]}
    for k in range(0, 10):
        row = dict(lag=k)
        for key, x in [("newSelfServe", xs), ("dealsCreated", xe), ("newEnterpriseArr", xe)]:
            y = ys[key]
            row[key] = round(float(np.corrcoef(x[: len(x) - k], y[k:])[0, 1]), 3) if k < len(x) - 6 else None
        lag_rows.append(row)
    best_lag = {key: max((r for r in lag_rows if r[key] is not None), key=lambda r: r[key])["lag"]
                for key in ["newSelfServe", "dealsCreated", "newEnterpriseArr"]}

    # ---- self-serve MMM --------------------------------------------------------------------
    y = outw["newSelfServe"].to_numpy()
    mmm = fit_mmm(pd.DataFrame({"total": total}, index=spw.index), y)
    last12 = slice(len(y) - 12, len(y))
    paid12 = mmm["contrib"][last12].sum(axis=0)
    spend12 = spw.to_numpy()[last12].sum(axis=0)
    bookings12 = y[last12].sum()

    # ---- enterprise: deals created vs lagged adstock ----------------------------------------
    lag_e = max(1, best_lag["dealsCreated"])
    ad_e = adstock(ent_spend, 0.6)
    ad_e = np.concatenate([np.zeros(lag_e), ad_e[:-lag_e]])
    tt = np.arange(len(ad_e))
    Xe = np.column_stack([tt, ad_e / 10_000])
    me = Ridge(alpha=0.5, positive=True).fit(Xe, outw["dealsCreated"].to_numpy())
    deals_per_10k = float(me.coef_[1])
    d = raw.deals
    closed = d[(d["hs_is_closed"] == 1) & (d["closedate"] <= as_of)]
    win_rate = float(closed["hs_is_closed_won"].mean())
    avg_deal = float(d["amount_in_home_currency"].mean())
    cycle = float((closed[closed["hs_is_closed_won"] == 1]["closedate"] - closed[closed["hs_is_closed_won"] == 1]["createdate"]).dt.days.median())
    ent_paid_share = float(np.clip(me.coef_[1] * (ad_e[-12:] / 10_000).sum() / max(1, outw["dealsCreated"].to_numpy()[-12:].sum()), 0, 1))

    # ---- tables ---------------------------------------------------------------------------
    w = weekly.groupby("platform").agg(spend=("spend_eur", "sum"), impressions=("impressions", "sum"),
                                       clicks=("clicks", "sum"), conversions=("conversions", "sum"))
    ch_rows = []
    for i, c in enumerate(CHANNELS):
        if c not in w.index:
            continue
        r = w.loc[c]
        ch_rows.append(dict(platform=c, label=LABELS[c], spend=round(float(r.spend)), spend12m=round(float(spend12[i])),
                            impressions=int(r.impressions), clicks=int(r.clicks), conversions=int(r.conversions),
                            cpc=round(float(r.spend / max(r.clicks, 1)), 2), ctr=round(float(r.clicks / max(r.impressions, 1)), 4),
                            cpl=round(float(r.spend / max(r.conversions, 1))),
                            firstSpend=str(weekly[weekly["platform"] == c]["week_start"].min().date())))
    cs = weekly.groupby("campaign_id").agg(spend=("spend_eur", "sum"), clicks=("clicks", "sum"), conversions=("conversions", "sum"))
    cm = campaigns.set_index("campaign_id").join(cs, how="inner").sort_values("spend", ascending=False)
    camp_rows = [dict(name=r["name"], platform=LABELS[r["platform"]], kind=r["kind"], segment=r["target_segment"],
                      objective=r["objective"], start=r["start_date"], end=r["end_date"], spend=round(float(r["spend"])),
                      clicks=int(r["clicks"]), conversions=int(r["conversions"]),
                      cpl=round(float(r["spend"] / max(r["conversions"], 1))))
                 for _, r in cm.iterrows()]

    rev = raw.charges[raw.charges["status"] == "succeeded"]
    rev_year = rev.groupby(rev["created"].dt.year)["amount"].sum() / 100
    yearly = []
    for yr, g in weekly.groupby(weekly["week_start"].dt.year):
        yearly.append(dict(year=int(yr), spend=round(float(g["spend_eur"].sum())), revenue=round(float(rev_year.get(yr, 0))),
                           pctOfRevenue=round(float(g["spend_eur"].sum() / rev_year.get(yr, np.nan)), 3),
                           channels=int(g["platform"].nunique()), campaigns=int(g["campaign_id"].nunique()),
                           partialYear=bool(yr == pd.Timestamp(as_of).year)))

    monthly = []
    fitted_full = np.full(len(months), np.nan)
    fitted_full[win] = mmm["fitted"]
    paid_full = np.zeros(len(months))
    paid_full[win] = mmm["contrib"].sum(axis=1)
    for i, m in enumerate(months):
        row = dict(month=str(m), **{c: round(float(sp.iloc[i][c])) for c in CHANNELS},
                   newSelfServe=round(float(out.iloc[i]["newSelfServe"])), dealsCreated=int(out.iloc[i]["dealsCreated"]),
                   newEnterpriseArr=round(float(out.iloc[i]["newEnterpriseArr"])),
                   modelSelfServe=None if np.isnan(fitted_full[i]) else round(float(fitted_full[i])),
                   paidSelfServe=round(float(paid_full[i])))
        monthly.append(row)

    return dict(
        asOf=str(pd.Timestamp(as_of).date()),
        yearly=yearly, monthly=monthly, channels=ch_rows, campaigns=camp_rows,
        lag=dict(rows=lag_rows, best=best_lag,
                 labels=dict(newSelfServe="Self-serve new bookings", dealsCreated="Enterprise deals created",
                             newEnterpriseArr="Enterprise new ARR won")),
        mmm=dict(target="Self-serve new bookings (first invoices)", decay=mmm["decay"],
                 halfLifeMonths=round(float(np.log(0.5) / np.log(mmm["decay"])), 1) if mmm["decay"] > 0 else 0.0,
                 r2=round(mmm["r2"], 3), cvMae=round(mmm["mae"]),
                 paidShare12m=round(float(paid12.sum() / bookings12), 3), paidBookings12m=round(float(paid12.sum())),
                 spend12m=round(float(spend12.sum())), roas12m=round(float(paid12.sum() / spend12.sum()), 2)),
        enterprise=dict(lagMonths=lag_e, dealsPer10k=round(deals_per_10k, 2), winRate=round(win_rate, 3),
                        avgDeal=round(avg_deal), cycleDays=round(cycle), paidShareDeals12m=round(ent_paid_share, 3),
                        expectedArrPer10k=round(deals_per_10k * win_rate * avg_deal),
                        revenueLagMonths=round(lag_e + cycle / 30.4)),
        _paid_share_ss=float(paid12.sum() / bookings12), _paid_share_ent=ent_paid_share,
    )
