"""Monte Carlo revenue forecast as of a given date.

Five components, each simulated per run so the totals carry honest uncertainty:
  existingSelfServe   current Stripe subscriptions: renewal (model), seat expansion, open invoices
  newSelfServe        new self-serve customers (seasonal trend on Stripe sign-ups)
  existingEnterprise  current enterprise contracts: renewal (payment-behaviour rule), uplift, open invoices
  pipelineEnterprise  open HubSpot deals: win (deal model), close-date slip, payment timing
  futurePipeline      deals not created yet: creation rate x historical win rate and cycle

Revenue is cash (successful charges minus refunds), matching how Hamina reports it.
ARR is month-end MRR x 12.
"""

from dataclasses import dataclass, field

import numpy as np
import pandas as pd

import deals as dm
import renewals as rn
from data import Raw, terms_as_of, deal_state_at

COMPONENTS = ["existingSelfServe", "newSelfServe", "existingEnterprise", "pipelineEnterprise", "futurePipeline"]


@dataclass
class Levers:
    self_serve_renewal_pp: float = 0.0
    win_rate_pp: float = 0.0
    pipeline_creation_pct: float = 0.0
    new_self_serve_pct: float = 0.0
    deal_size_pct: float = 0.0


@dataclass
class Context:
    """Everything the simulation needs, fitted with data up to as_of only."""
    as_of: pd.Timestamp
    horizon_end: pd.Timestamp
    terms: pd.DataFrame
    ss_current: pd.DataFrame
    ent_current: pd.DataFrame
    open_invoices: pd.DataFrame
    seat_ratios: np.ndarray
    ss_first_renewal: dict
    new_ss_lambda: np.ndarray
    new_ss_level_sd: float
    new_ss_pool: pd.DataFrame
    ent_rates: dict
    ent_uplift: np.ndarray
    ent_pay_days: np.ndarray
    open_deals: pd.DataFrame
    slip_days: np.ndarray
    cycle_days: np.ndarray
    deal_amounts: np.ndarray
    win_rate: float
    deals_per_month: float
    renewal_model: rn.SelfServeRenewalModel
    deal_model: dm.DealModel
    extras: dict = field(default_factory=dict)


def build_context(raw: Raw, as_of, horizon_end) -> Context:
    as_of, horizon_end = pd.Timestamp(as_of), pd.Timestamp(horizon_end)
    t = terms_as_of(raw, as_of)

    # --- self-serve renewal model -----------------------------------------------------------
    feat = rn.term_features(t, raw, as_of)
    events = rn.renewal_events(feat, as_of)
    rmodel = rn.SelfServeRenewalModel().fit(events)
    cur = feat[feat["valid"] & (feat["period_start"] <= as_of) & (feat["effective_end"] > as_of)]
    cur = cur.sort_values("period_start").groupby("subscription_id").tail(1).copy()
    cur["p_renew"] = rmodel.predict(cur)
    clean = cur.assign(tenure_2plus=1, seat_down_last=0, seat_up_last=0, failed_payment=0, paid_late=0, scheduled_cancel=False)
    cur["p_next"] = rmodel.predict(clean)
    cur["unit_eur"] = cur["amount_eur"] / cur["quantity"]
    delays = _pay_delays(t)
    cur["pay_delay"] = cur["customer_id"].map(delays["by_customer"]).fillna(
        pd.Series(np.where(cur["collection_method"] == "send_invoice", delays["ss_invoice_median"], 0), index=cur.index))
    renewed = events[events["renewed"] == 1]
    seat_ratios = _seat_ratios(feat, renewed)
    first = events[events["tenure_2plus"] == 0]
    ss_first = first.groupby("months")["renewed"].mean().to_dict()

    # --- new self-serve customers -----------------------------------------------------------
    lam, level_sd = _new_customer_rate(t, as_of, horizon_end)
    starts = t[(t["segment"] == "self_serve") & (t["billing_reason"] == "subscription_create")]
    pool = starts[starts["invoiced_at"] > as_of - pd.Timedelta(days=365)][["quantity", "amount_eur", "months", "collection_method"]]

    # --- enterprise -------------------------------------------------------------------------
    rates, uplift_mean, ent_hist = rn.enterprise_renewal_rates(t, as_of)
    ent = t[(t["segment"] == "enterprise") & t["valid"] & (t["period_start"] <= as_of) & (t["period_end"] > as_of)].copy()
    days_late = (ent["paid_at"].where(ent["paid"]) - ent["due_date"]).dt.days
    overdue = (~ent["paid"]) & ((as_of - ent["due_date"]).dt.days > rn.LATE_GRACE_DAYS)
    ent["late"] = (days_late > rn.LATE_GRACE_DAYS) | overdue
    ent["days_late"] = days_late.fillna((as_of - ent["due_date"]).dt.days.clip(lower=0))
    ent["p_renew"] = np.where(ent["late"], rates[True], rates[False])
    ent["pay_delay"] = ent["customer_id"].map(delays["by_customer"]).fillna(delays["ent_median"])
    ent_up = []
    for _, g in t[t["segment"] == "enterprise"].sort_values("period_start").groupby("subscription_id"):
        a = g["amount_eur"].to_numpy()
        ent_up += list(a[1:] / a[:-1] - 1)
    ent_pay = delays["ent_all"]

    # --- open invoices (receivables) ---------------------------------------------------------
    open_inv = t[~t["paid"] & t["valid"] & ~t["refunded"]].copy()
    open_inv = open_inv[open_inv["written_off_at"].isna()]
    open_inv["typical_delay"] = open_inv["customer_id"].map(delays["by_customer"]).fillna(
        pd.Series(np.where(open_inv["segment"] == "enterprise", delays["ent_median"], delays["ss_invoice_median"]), index=open_inv.index))
    open_inv["p_pay"] = np.where(open_inv["segment"] == "enterprise", 0.98,
                                 np.where(open_inv["collection_method"] == "send_invoice", delays["ss_invoice_pay_rate"], 0.45))

    # --- pipeline ------------------------------------------------------------------------------
    snaps = dm.snapshots(raw, as_of)
    dmodel = dm.DealModel().fit(snaps)
    od = dm.open_deals(raw, as_of)
    od["p_win"] = dmodel.predict(od) if len(od) else []
    closed = raw.deals[(raw.deals["hs_is_closed"] == 1) & (raw.deals["closedate"] <= as_of)]
    win_rate = float(closed["hs_is_closed_won"].mean())
    created = raw.deals[(raw.deals["createdate"] <= as_of) & (raw.deals["createdate"] > as_of - pd.Timedelta(days=182))]
    deals_pm = len(created) / 6
    amounts = raw.deals[raw.deals["createdate"] <= as_of]["amount_in_home_currency"].to_numpy()

    return Context(as_of, horizon_end, t, cur, ent, open_inv, seat_ratios, ss_first, lam, level_sd, pool,
                   rates, np.array(ent_up) if ent_up else np.array([uplift_mean]), ent_pay, od, dmodel.slip_days,
                   dmodel.cycle_days, amounts, win_rate, deals_pm, rmodel, dmodel,
                   extras=dict(events=events, feat=feat, snaps=snaps, ent_hist=ent_hist, delays=delays))


def _pay_delays(t):
    paid = t[t["paid"] & (t["collection_method"] == "send_invoice")]
    d = (paid["paid_at"] - paid["invoiced_at"]).dt.total_seconds() / 86400
    ss_inv = t[(t["segment"] == "self_serve") & (t["collection_method"] == "send_invoice") & (t["invoiced_at"] < t["invoiced_at"].max() - pd.Timedelta(days=120))]
    return dict(by_customer=d.groupby(paid["customer_id"]).mean(),
                ent_median=float(d[paid["segment"] == "enterprise"].median()),
                ent_all=d[paid["segment"] == "enterprise"].to_numpy(),
                ss_invoice_median=float(d[paid["segment"] == "self_serve"].median()),
                ss_invoice_pay_rate=float(ss_inv["paid"].mean()) if len(ss_inv) else 0.95)


def _seat_ratios(feat, renewed):
    nxt = feat.groupby("subscription_id")["quantity"].shift(-1)
    r = (nxt / feat["quantity"]).reindex(renewed.index).dropna()
    return r.to_numpy() if len(r) else np.array([1.0])


def _new_customer_rate(t, as_of, horizon_end):
    """Monthly new self-serve customers: seasonal index x damped log-linear trend."""
    starts = t[(t["segment"] == "self_serve") & (t["billing_reason"] == "subscription_create")]
    counts = starts.groupby(starts["invoiced_at"].dt.to_period("M")).size()
    last = as_of.to_period("M")
    counts = counts[counts.index <= last]
    counts = counts.reindex(pd.period_range(counts.index.min(), last, freq="M"), fill_value=0)
    ma = counts.rolling(12, center=True).mean()
    ratio = (counts / ma).dropna()
    season = ratio.groupby(ratio.index.month).mean().reindex(range(1, 13)).fillna(1.0)
    season = 1 + 0.6 * (season / season.mean() - 1)  # shrink towards flat
    recent = counts.iloc[-18:]
    y = np.log(np.maximum(recent.to_numpy(), 1) / season.loc[recent.index.month].to_numpy())
    x = np.arange(len(y))
    b, a = np.polyfit(x, y, 1)
    resid_sd = float(np.std(y - (a + b * x)))
    months = pd.period_range(last + 1, horizon_end.to_period("M"), freq="M")
    damp = np.cumsum(0.97 ** np.arange(1, len(months) + 1))  # damped growth
    lam = np.exp(a + b * (x[-1] + damp)) * season.loc[months.month].to_numpy()
    return lam, max(0.06, resid_sd / 2)


# ---------------------------------------------------------------------------
# Simulation
# ---------------------------------------------------------------------------
class Sim:
    def __init__(self, ctx: Context, n, seed):
        self.ctx, self.n = ctx, n
        self.rng = np.random.default_rng(seed)
        self.day0 = ctx.as_of.normalize() + pd.Timedelta(days=1)
        self.n_days = (ctx.horizon_end.normalize() - self.day0).days + 1
        self.cash = {c: np.zeros((n, self.n_days)) for c in COMPONENTS}
        self.months = pd.period_range(self.day0.to_period("M"), ctx.horizon_end.to_period("M"), freq="M")
        self.month_end_day = np.array([(m.end_time.normalize() - self.day0).days for m in self.months])
        self.mrr = {c: np.zeros((n, len(self.months))) for c in COMPONENTS}
        self.bridge = {k: np.zeros(n) for k in ["ss_churn", "ss_start", "ent_churn", "ent_start"]}
        self.receivables = np.zeros((n, self.n_days))  # open-invoice cash (also counted in its component)
        self.invoice_paid_day = {}                      # invoice number -> (n,) pay day, -1 = unpaid

    def day(self, ts):
        return (pd.Timestamp(ts).normalize() - self.day0).days

    def add_cash(self, comp, sims, days, amounts):
        days = np.asarray(days)
        ok = (days >= 0) & (days < self.n_days)
        np.add.at(self.cash[comp], (np.asarray(sims)[ok], days[ok]), np.asarray(amounts)[ok])

    def add_mrr(self, comp, start_day, end_day, mrr_by_sim):
        """mrr_by_sim: (n,) MRR active on month ends within [start_day, end_day)."""
        mask = (self.month_end_day >= start_day) & (self.month_end_day < end_day)
        if mask.any():
            self.mrr[comp][:, mask] += mrr_by_sim[:, None]

    def add_mrr_events(self, comp, sims, start_days, end_days, mrr):
        """Vectorised version for many customers: each row covers month ends in [start, end)."""
        me = self.month_end_day[None, :]
        cover = (me >= start_days[:, None]) & (me < end_days[:, None])
        rows, cols = np.nonzero(cover)
        np.add.at(self.mrr[comp], (sims[rows], cols), mrr[rows])


def _receivables(sim: Sim, lv: Levers):
    ctx, rng, n = sim.ctx, sim.rng, sim.n
    for _, r in ctx.open_invoices.iterrows():
        comp = "existingEnterprise" if r["segment"] == "enterprise" else "existingSelfServe"
        expected = r["invoiced_at"] + pd.Timedelta(days=float(r["typical_delay"]))
        base = max(sim.day(expected), 0)
        jitter = rng.normal(0, 6 if r["segment"] == "enterprise" else 4, n)
        overdue_extra = rng.exponential(10, n) if expected <= ctx.as_of else 0
        days = np.maximum(np.round(base + jitter + overdue_extra), 0).astype(int)
        pays = rng.random(n) < r["p_pay"]
        sim.add_cash(comp, np.arange(n)[pays], days[pays], np.full(pays.sum(), r["amount_eur"]))
        ok = pays & (days < sim.n_days)
        np.add.at(sim.receivables, (np.arange(n)[ok], days[ok]), r["amount_eur"])
        sim.invoice_paid_day[r["number"]] = np.where(pays, days, -1)


def _existing_self_serve(sim: Sim, lv: Levers):
    ctx, rng, n = sim.ctx, sim.rng, sim.n
    horizon = sim.n_days
    for _, r in ctx.ss_current.iterrows():
        qty = np.full(n, float(r["quantity"]))
        alive = np.ones(n, bool)
        months, unit = int(r["months"]), float(r["unit_eur"])
        start = sim.day(r["period_start"])
        end = sim.day(r["effective_end"])
        arr0 = r["quantity"] * unit * 12 / months
        sim.bridge["ss_start"] += arr0
        sim.add_mrr("existingSelfServe", start, end, alive * qty * unit / months)
        k = 0
        while end < horizon:
            p = (r["p_renew"] if k == 0 else r["p_next"]) + lv.self_serve_renewal_pp / 100
            renew = alive & (rng.random(n) < np.clip(p, 0, 0.99))
            qty = np.where(renew, np.maximum(1, np.round(qty * rng.choice(ctx.seat_ratios, n))), qty)
            delay = int(round(r["pay_delay"])) if r["collection_method"] == "send_invoice" else 0
            sims = np.nonzero(renew)[0]
            sim.add_cash("existingSelfServe", sims, np.full(len(sims), end + delay), qty[sims] * unit)
            alive = renew
            nxt_end = end + int(round(months * 30.44))
            sim.add_mrr("existingSelfServe", end, nxt_end, alive * qty * unit / months)
            end, k = nxt_end, k + 1
        sim.bridge["ss_churn"] += np.where(alive, 0, arr0)


def _new_self_serve(sim: Sim, lv: Levers):
    ctx, rng, n = sim.ctx, sim.rng, sim.n
    level = rng.lognormal(0, ctx.new_ss_level_sd, n)
    pool = ctx.new_ss_pool.to_numpy()
    p_first = {int(k): v for k, v in ctx.ss_first_renewal.items()}
    for mi, m in enumerate(sim.months):
        lam = ctx.new_ss_lambda[mi] * level * (1 + lv.new_self_serve_pct / 100)
        counts = rng.poisson(lam)
        sims = np.repeat(np.arange(n), counts)
        if not len(sims):
            continue
        pick = pool[rng.integers(0, len(pool), len(sims))]
        qty, amount, months = pick[:, 0].astype(float), pick[:, 1].astype(float), pick[:, 2].astype(int)
        m_start = max(sim.day(m.start_time), 0)
        start = m_start + rng.integers(0, m.days_in_month, len(sims))
        delay = np.where(pick[:, 3] == "send_invoice", ctx.extras["delays"]["ss_invoice_median"], 0).astype(float)
        sim.add_cash("newSelfServe", sims, (start + delay).astype(int), amount)
        alive = np.ones(len(sims), bool)
        end = start + np.round(months * 30.44).astype(int)
        sim.add_mrr_events("newSelfServe", sims, start, end, amount / months)
        for k in range(3):
            due = alive & (end < sim.n_days)
            if not due.any():
                break
            p = np.array([p_first.get(int(mm), 0.7) for mm in months]) + lv.self_serve_renewal_pp / 100
            if k > 0:
                p = p + 0.08
            renew = due & (rng.random(len(sims)) < p)
            idx = np.nonzero(renew)[0]
            sim.add_cash("newSelfServe", sims[idx], (end[idx] + delay[idx]).astype(int), amount[idx])
            nxt = end + np.round(months * 30.44).astype(int)
            sim.add_mrr_events("newSelfServe", sims[idx], end[idx], nxt[idx], amount[idx] / months[idx])
            alive, end = renew, nxt


def _existing_enterprise(sim: Sim, lv: Levers):
    ctx, rng, n = sim.ctx, sim.rng, sim.n
    for _, r in ctx.ent_current.iterrows():
        value = np.full(n, float(r["amount_eur"]))
        alive = np.ones(n, bool)
        start, end = sim.day(r["period_start"]), sim.day(r["period_end"])
        sim.bridge["ent_start"] += r["amount_eur"]
        arr0 = float(r["amount_eur"])
        sim.add_mrr("existingEnterprise", start, end, value / 12)
        k = 0
        while end < sim.n_days:
            p = r["p_renew"] if k == 0 else ctx.ent_rates[False]
            renew = alive & (rng.random(n) < p)
            value = np.where(renew, value * (1 + rng.choice(ctx.ent_uplift, n)), value)
            pay = np.maximum(0, r["pay_delay"] + rng.normal(0, 7, n))
            sims = np.nonzero(renew)[0]
            sim.add_cash("existingEnterprise", sims, (end + pay[sims]).astype(int), value[sims])
            alive = renew
            sim.add_mrr("existingEnterprise", end, end + 365, alive * value / 12)
            end, k = end + 365, k + 1
        sim.bridge["ent_churn"] += np.where(alive, 0, arr0)


def _new_logo(sim, comp, sims, close_day, amount):
    """Contract starts shortly after close; invoiced at start, paid per enterprise payment habits."""
    ctx, rng = sim.ctx, sim.rng
    start = close_day + rng.integers(3, 15, len(sims))
    pay = rng.choice(ctx.ent_pay_days, len(sims)) if len(ctx.ent_pay_days) else np.full(len(sims), 35.0)
    sim.add_cash(comp, sims, (start + pay).astype(int), amount)
    sim.add_mrr_events(comp, sims, start, start + 365, amount / 12)
    renew_ok = (start + 365 < sim.n_days) & (rng.random(len(sims)) < ctx.ent_rates[False])
    idx = np.nonzero(renew_ok)[0]
    up = amount[idx] * (1 + rng.choice(ctx.ent_uplift, len(idx)))
    sim.add_cash(comp, sims[idx], (start[idx] + 365 + pay[idx]).astype(int), up)
    sim.add_mrr_events(comp, sims[idx], start[idx] + 365, start[idx] + 730, up / 12)


def _pipeline(sim: Sim, lv: Levers):
    ctx, rng, n = sim.ctx, sim.rng, sim.n
    slip = ctx.slip_days if len(ctx.slip_days) else np.array([30.0])
    for _, d in ctx.open_deals.iterrows():
        p = np.clip(d["p_win"] + lv.win_rate_pp / 100, 0, 0.99)
        win = rng.random(n) < p
        rep = sim.day(d["closedate_at"])
        close = rep + rng.choice(slip, n)
        close = np.where(close < 0, rng.integers(7, 60, n), close)  # overdue deals: closes soon if at all
        sims = np.nonzero(win)[0]
        amount = np.full(len(sims), d["amount_in_home_currency"] * (1 + lv.deal_size_pct / 100))
        _new_logo(sim, "pipelineEnterprise", sims, close[sims].astype(int), amount)


def _future_pipeline(sim: Sim, lv: Levers):
    ctx, rng, n = sim.ctx, sim.rng, sim.n
    rate = ctx.deals_per_month * (1 + lv.pipeline_creation_pct / 100)
    p = np.clip(ctx.win_rate + lv.win_rate_pp / 100, 0, 0.99)
    for m in sim.months:
        created = rng.poisson(rate, n)
        wins = rng.binomial(created, p)
        sims = np.repeat(np.arange(n), wins)
        if not len(sims):
            continue
        create_day = max(sim.day(m.start_time), 0) + rng.integers(0, m.days_in_month, len(sims))
        close = create_day + rng.choice(ctx.cycle_days, len(sims))
        amount = rng.choice(ctx.deal_amounts, len(sims)) * (1 + lv.deal_size_pct / 100)
        _new_logo(sim, "futurePipeline", sims, close.astype(int), amount)


def run(ctx: Context, n=2000, seed=7, levers: Levers | None = None) -> Sim:
    lv = levers or Levers()
    sim = Sim(ctx, n, seed)
    _receivables(sim, lv)
    _existing_self_serve(sim, lv)
    _new_self_serve(sim, lv)
    _existing_enterprise(sim, lv)
    _pipeline(sim, lv)
    _future_pipeline(sim, lv)
    return sim


def monthly_cash(sim: Sim, comp=None):
    """(n, months) cash per month for a component or the total."""
    comps = [comp] if comp else COMPONENTS
    daily = sum(sim.cash[c] for c in comps)
    dates = sim.day0 + pd.to_timedelta(np.arange(sim.n_days), unit="D")
    idx = np.searchsorted(sim.months.to_timestamp().to_numpy(), dates.to_numpy(), side="right") - 1
    out = np.zeros((sim.n, len(sim.months)))
    for mi in range(len(sim.months)):
        out[:, mi] = daily[:, idx == mi].sum(axis=1)
    return out


def total_mrr(sim: Sim):
    return sum(sim.mrr[c] for c in COMPONENTS)
