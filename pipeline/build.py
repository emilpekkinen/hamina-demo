#!/usr/bin/env python3
"""Build web/src/data/forecast.json: forecast, models, backtests, identity resolution, scenarios.

Usage:  python3 pipeline/build.py
"""

import json
import sys
import time
import warnings
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

import deals as dm
import renewals as rn
import simulate as sm
from data import ROOT, cash_by_month, customer_mrr_at, load, month_ends, mrr_at, terms_as_of
from identity import resolve

warnings.filterwarnings("ignore")

AS_OF = pd.Timestamp("2026-09-30 23:59:59")
HORIZON_END = pd.Timestamp("2027-12-31")
HISTORY_START = "2024-01"
PLAN_FY2026 = 3_420_000
N_SIMS = 4000
BACKTEST_DATES = ["2025-03-31", "2025-06-30", "2025-09-30", "2025-12-31", "2026-03-31"]
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "web" / "src" / "data" / "forecast.json"


def band(x):
    p10, p50, p90 = np.percentile(x, [10, 50, 90])
    return dict(p10=round(float(p10)), p50=round(float(p50)), p90=round(float(p90)))


def d(ts):
    return pd.Timestamp(ts).strftime("%Y-%m-%d")


def main():
    t0 = time.time()
    raw = load()
    terms = terms_as_of(raw, AS_OF)
    ctx = sm.build_context(raw, AS_OF, HORIZON_END)
    sim = sm.run(ctx, n=N_SIMS, seed=7)
    print(f"context + simulation: {time.time() - t0:.1f}s")

    cash_hist = cash_by_month(raw, HISTORY_START, AS_OF.strftime("%Y-%m"))
    fc_cash = sm.monthly_cash(sim)
    fc_mrr = sm.total_mrr(sim)
    months_fc = [str(m) for m in sim.months]
    q4_2026 = [i for i, m in enumerate(months_fc) if m.startswith("2026")]
    y2027 = [i for i, m in enumerate(months_fc) if m.startswith("2027")]
    ytd = float(cash_hist[[p for p in cash_hist.index if p.year == 2026]].sum())

    # ---------------------------------------------------------------- monthly series
    monthly = []
    for p in cash_hist.index:
        me = p.end_time
        seg = mrr_at(terms, me)
        monthly.append(dict(month=str(p), actualRevenue=round(float(cash_hist[p])), revenue=None, components=None,
                            actualArr=round(float(seg.sum() * 12)), arr=None,
                            actualArrBySegment=dict(selfServe=round(float(seg.get("self_serve", 0) * 12)),
                                                    enterprise=round(float(seg.get("enterprise", 0) * 12)))))
    comp_cash = {c: sm.monthly_cash(sim, c) for c in sm.COMPONENTS}
    for i, m in enumerate(months_fc):
        monthly.append(dict(month=m, actualRevenue=None, revenue=band(fc_cash[:, i]),
                            components={c: round(float(comp_cash[c][:, i].mean())) for c in sm.COMPONENTS},
                            actualArr=None, arr=band(fc_mrr[:, i] * 12), actualArrBySegment=None))

    # ---------------------------------------------------------------- KPIs
    seg_now = mrr_at(terms, AS_OF)
    arr_now = float(seg_now.sum() * 12)
    year_ago = AS_OF - pd.DateOffset(years=1)
    arr_year_ago = float(mrr_at(terms, year_ago).sum() * 12)
    c_now, c_then = customer_mrr_at(terms, AS_OF), customer_mrr_at(terms, year_ago)
    base = c_then[c_then > 0]
    nrr = float(c_now.reindex(base.index, fill_value=0).sum() / base.sum())
    grr = float(np.minimum(c_now.reindex(base.index, fill_value=0), base).sum() / base.sum())
    active = c_now[c_now > 0]
    seg_of = raw.customers.set_index("id")["segment"]
    ytd_prev = float(cash_by_month(raw, "2025-01", "2025-09").sum())
    od = ctx.open_deals
    first90 = sim.cash
    cash90 = sum(sim.cash[c][:, :90] for c in sm.COMPONENTS).sum(axis=1)
    overdue = ctx.open_invoices[ctx.open_invoices["due_date"] < AS_OF]["amount_eur"].sum()
    kpis = dict(
        arr=round(arr_now), arrYoY=round(arr_now / arr_year_ago - 1, 3), mrr=round(arr_now / 12),
        nrr12m=round(nrr, 3), grr12m=round(grr, 3),
        activeCustomers=dict(selfServe=int((active.index.map(seg_of) == "self_serve").sum()),
                             enterprise=int((active.index.map(seg_of) == "enterprise").sum())),
        revenueYtd=round(ytd), revenueYtdYoY=round(ytd / ytd_prev - 1, 3),
        fy2026={**band(ytd + fc_cash[:, q4_2026].sum(axis=1)), "plan": PLAN_FY2026, "actualYtd": round(ytd)},
        fy2027=band(fc_cash[:, y2027].sum(axis=1)),
        arrDec2026=band(fc_mrr[:, q4_2026[-1]] * 12), arrDec2027=band(fc_mrr[:, -1] * 12),
        openPipeline=dict(count=int(len(od)), amount=round(float(od["amount_in_home_currency"].sum())),
                          hubspotWeighted=round(float((od["amount_in_home_currency"] * od["hubspot_prob"]).sum())),
                          modelExpected=round(float((od["amount_in_home_currency"] * od["p_win"]).sum()))),
        cashNext90d=band(cash90), overdueReceivables=round(float(overdue)),
    )

    # ---------------------------------------------------------------- ARR bridge (expected values)
    ss_end = sim.mrr["existingSelfServe"][:, -1].mean() * 12
    ss_start, ss_churn = sim.bridge["ss_start"].mean(), sim.bridge["ss_churn"].mean()
    ent_end = sim.mrr["existingEnterprise"][:, -1].mean() * 12
    ent_start, ent_churn = sim.bridge["ent_start"].mean(), sim.bridge["ent_churn"].mean()
    steps = [("ARR today", ss_start + ent_start, "start", "Active Stripe subscriptions and contracts"),
             ("New self-serve", sim.mrr["newSelfServe"][:, -1].mean() * 12, "increase", "Seasonal sign-up trend, net of their own churn"),
             ("Self-serve expansion", ss_end - (ss_start - ss_churn), "increase", "Seat growth at renewal"),
             ("Self-serve churn", -ss_churn, "decrease", "Renewal model on Stripe payment signals"),
             ("Enterprise uplift", ent_end - (ent_start - ent_churn), "increase", "Historical renewal price uplift"),
             ("Enterprise churn", -ent_churn, "decrease", "Late payers renew far less often"),
             ("New logos: open pipeline", sim.mrr["pipelineEnterprise"][:, -1].mean() * 12, "increase", "Deal model x close-date slip"),
             ("New logos: future pipeline", sim.mrr["futurePipeline"][:, -1].mean() * 12, "increase", "Deals not created yet")]
    end_value = sum(v for _, v, _, _ in steps)
    bridge = dict(period=f"{AS_OF:%b %Y} → {HORIZON_END:%b %Y}",
                  steps=[dict(name=n, value=round(float(v)), kind=k, note=note) for n, v, k, note in steps]
                  + [dict(name="ARR Dec 2027", value=round(float(end_value)), kind="end", note="Expected value")])

    # ---------------------------------------------------------------- MRR movements
    movements = []
    prev = customer_mrr_at(terms, pd.Timestamp("2022-12-31 23:59:59"))
    ever = set(prev[prev > 0].index)
    for me in month_ends("2023-01-01", AS_OF):
        cur = customer_mrr_at(terms, me)
        ids = prev.index.union(cur.index)
        a, b = prev.reindex(ids, fill_value=0), cur.reindex(ids, fill_value=0)
        delta = b - a
        new_mask = (a == 0) & (b > 0)
        react = new_mask & ids.isin(list(ever))
        movements.append(dict(month=me.strftime("%Y-%m"), new=round(float(b[new_mask & ~react].sum())),
                              reactivation=round(float(b[react].sum())),
                              expansion=round(float(delta[(a > 0) & (b > a)].sum())),
                              contraction=round(float(delta[(b > 0) & (b < a)].sum())),
                              churn=round(float(-a[(a > 0) & (b == 0)].sum()))))
        ever |= set(cur[cur > 0].index)
        prev = cur

    # ---------------------------------------------------------------- cohorts (self-serve, quarterly)
    ss = terms[(terms["segment"] == "self_serve") & ~terms["refunded"]]
    first = ss.groupby("customer_id")["period_start"].min()
    cohorts = []
    for q in pd.period_range("2023Q1", AS_OF.to_period("Q") - 1, freq="Q"):
        members = first[(first >= q.start_time) & (first <= q.end_time)].index
        start_mrr = customer_mrr_at(terms, q.end_time).reindex(members, fill_value=0).sum()
        ret = []
        for k in range(1, 9):
            when = (q + k).end_time
            ret.append(None if when > AS_OF else round(float(customer_mrr_at(terms, when).reindex(members, fill_value=0).sum() / start_mrr), 3))
        cohorts.append(dict(cohort=str(q), customers=int(len(members)), startMrr=round(float(start_mrr)), retention=ret))

    # ---------------------------------------------------------------- renewal model
    events = ctx.extras["events"]
    oot = rn.evaluate_out_of_time(events, pd.Timestamp("2026-01-01"))
    renewal_model = dict(trainingRows=int(len(events)), aucTest=round(oot["auc"], 3),
                         testPeriod=f"{oot['n_test']} renewals Jan–Sep 2026 (out of time)",
                         baseRate=round(float(events["renewed"].mean()), 3), drivers=ctx.renewal_model.drivers(),
                         calibration=oot["calibration"], lift=oot["lift"])

    # ---------------------------------------------------------------- upcoming renewals
    cust = raw.customers.set_index("id")
    horizon_r = AS_OF + pd.Timedelta(days=180)
    renewals = []
    sc = ctx.ss_current[(ctx.ss_current["effective_end"] > AS_OF) & (ctx.ss_current["effective_end"] <= horizon_r)].copy()
    sc["arr"] = sc["quantity"] * sc["unit_eur"] * 12 / sc["months"]
    sc["exp_loss"] = sc["arr"] * (1 - sc["p_renew"])
    # Scheduled cancellations are already known; show a few, then the model's riskiest open decisions.
    sched = sc[sc["scheduled_cancel"]].sort_values("exp_loss", ascending=False).head(6)
    scored = sc[~sc["scheduled_cancel"]].sort_values("exp_loss", ascending=False).head(22)
    kpis["scheduledCancellations"] = dict(count=int(sc["scheduled_cancel"].sum()), arr=round(float(sc.loc[sc["scheduled_cancel"], "arr"].sum())))
    for _, r in pd.concat([sched, scored]).iterrows():
        sig = []
        if r["scheduled_cancel"]:
            sig.append("Cancellation scheduled in Stripe")
        if r["failed_payment"]:
            sig.append("Failed payment on current term")
        if r["paid_late"]:
            sig.append(f"Paid invoice {int(r['days_late'])} days late" if r["days_late"] > 0 else "Invoice overdue")
        if r["seat_down_last"]:
            sig.append("Seat reduction at last renewal")
        if r["months"] == 6:
            sig.append("6-month plan")
        if not r["tenure_2plus"]:
            sig.append("First renewal")
        if r["channel_paid"]:
            sig.append("Acquired via paid search")
        c = cust.loc[r["customer_id"]]
        renewals.append(dict(customerId=r["customer_id"], name=c["name"], company=c["company_name"], segment="self_serve",
                             plan=f"{int(r['months'])}-month", seats=int(r["quantity"]), arr=round(float(r["arr"])),
                             renewalDate=d(r["effective_end"]), pRenew=round(float(r["p_renew"]), 3),
                             riskLevel=risk(r["p_renew"]), signals=sig, owner=None))
    for _, r in ctx.ent_current[ctx.ent_current["period_end"] <= horizon_r].iterrows():
        c = cust.loc[r["customer_id"]]
        sig = [f"Paid current term {int(r['days_late'])} days late" if r["late"] else "Pays on time"]
        renewals.append(dict(customerId=r["customer_id"], name=c["name"], company=c["company_name"], segment="enterprise",
                             plan="Enterprise", seats=int(r["quantity"]), arr=round(float(r["amount_eur"])),
                             renewalDate=d(r["period_end"]), pRenew=round(float(r["p_renew"]), 3),
                             riskLevel=risk(r["p_renew"]), signals=sig, owner=c["account_owner"]))
    renewals.sort(key=lambda x: x["renewalDate"])

    # ---------------------------------------------------------------- identity resolution
    ident = resolve(raw)
    ss_linked = ident[ident["segment"] == "self_serve"]
    seats = ctx.ss_current.groupby("customer_id")["quantity"].sum()
    company_seats = ss_linked.assign(seats=ss_linked["customer_id"].map(seats)).groupby("company_id")["seats"].sum()
    examples = pd.concat([ident[(ident["segment"] == "enterprise") & (ident["method"] != "domain")],
                          ident[ident["method"] == "domain"].head(4)])
    identity = dict(stripeCustomers=int(len(raw.customers)), hubspotCompanies=int(len(raw.companies)), matched=int(len(ident)),
                    byMethod={k: int(v) for k, v in ident["method"].value_counts().items()},
                    examples=[dict(stripeName=r["company_name"], hubspotName=r["hubspot_name"], method=r["method"],
                                   confidence=float(r["confidence"])) for _, r in examples.iterrows()],
                    selfServeAccountsInCrm=int(ss_linked["company_id"].nunique()))

    # ---------------------------------------------------------------- deals
    owners = raw.owners.set_index("id")
    stage_label = raw.stages.set_index("stage_id")["label"]
    comps = raw.companies.set_index("hs_object_id")["name"]
    slip_med = float(np.median(ctx.slip_days)) if len(ctx.slip_days) else 30.0
    deals_out = []
    for _, r in od.sort_values("amount_in_home_currency", ascending=False).iterrows():
        stage_slip = float(np.median(ctx.deal_model.slip_for_stage(r["stage_idx"])))
        model_close = max(r["closedate_at"] + pd.Timedelta(days=stage_slip), AS_OF + pd.Timedelta(days=21))
        flags = []
        if r["pushes"] >= 2:
            flags.append(f"Close date pushed {int(r['pushes'])}×")
        if r["overdue"]:
            flags.append("Close date already passed")
        if r["days_since_activity"] >= 21:
            flags.append(f"No activity {int(r['days_since_activity'])} days")
        if r["days_in_stage"] >= 60:
            flags.append(f"{int(r['days_in_stage'])} days in stage")
        linked = r["company_id"] in company_seats.index
        if linked:
            flags.append(f"Paying self-serve account ({int(company_seats[r['company_id']])} seats)")
        if r["p_win"] < r["hubspot_prob"] / 2:
            flags.append("Model far below stage probability")
        o = owners.loc[r["hubspot_owner_id"]]
        deals_out.append(dict(
            id=r["hs_object_id"], name=r["dealname"], company=comps.get(r["company_id"], ""), owner=f"{o['firstname']} {o['lastname']}",
            stage=stage_label[r["stage_at"]], stageOrder=int(r["stage_idx"]), amount=round(float(r["amount"])),
            currency=r["deal_currency_code"], amountEur=round(float(r["amount_in_home_currency"])),
            createDate=d(r["createdate"]), closeDateRep=d(r["closedate_at"]), closeDateModel=d(model_close),
            hubspotProb=float(r["hubspot_prob"]), modelProb=round(float(r["p_win"]), 3), forecastCategory=r["hs_forecast_category"],
            leadSource=r["lead_source"], daysInStage=int(r["days_in_stage"]), closeDatePushes=int(r["pushes"]),
            activity30d=int(r["activity_30d"]), lastActivity=d(r["last_activity_at"]) if pd.notna(r["last_activity_at"]) else None,
            flags=flags, stripeLinked=bool(linked), selfServeSeats=int(company_seats[r["company_id"]]) if linked else None))

    snaps = ctx.extras["snaps"]
    cv = dm.cross_validate(snaps)
    labels = list(stage_label)
    deal_model = dict(trainingSnapshots=int(len(snaps)), deals=int(snaps["hs_object_id"].nunique()),
                      brierModel=round(cv["brierModel"], 4), brierHubspot=round(cv["brierHubspot"], 4), aucModel=round(cv["auc"], 3),
                      stageCalibration=[dict(stage=stage_label.iloc[s["stage"]], hubspotProb=s["hubspotProb"],
                                             empiricalProb=s["empiricalProb"], n=s["n"]) for s in cv["stageCalibration"]],
                      slipDaysMedian=round(slip_med), drivers=ctx.deal_model.drivers())

    # ---------------------------------------------------------------- cash
    weekly = []
    total_daily = sum(sim.cash[c] for c in sm.COMPONENTS)
    renew_daily = sim.cash["existingSelfServe"] + sim.cash["existingEnterprise"] - sim.receivables
    new_daily = sim.cash["newSelfServe"] + sim.cash["pipelineEnterprise"] + sim.cash["futurePipeline"]
    for w in range(13):
        sl = slice(7 * w, 7 * w + 7)
        weekly.append(dict(weekStart=d(sim.day0 + pd.Timedelta(days=7 * w)), expected=band(total_daily[:, sl].sum(axis=1)),
                           components=dict(openInvoices=round(float(sim.receivables[:, sl].sum(axis=1).mean())),
                                           renewals=round(float(renew_daily[:, sl].sum(axis=1).mean())),
                                           newBusiness=round(float(new_daily[:, sl].sum(axis=1).mean())))))
    hist_late = terms[terms["paid"] & terms["due_date"].notna()].assign(
        late=lambda x: (x["paid_at"] - x["due_date"]).dt.days).groupby("customer_id")["late"].agg(["mean", "size"])
    open_list = []
    for _, r in ctx.open_invoices.sort_values("amount_eur", ascending=False).iterrows():
        days = sim.invoice_paid_day[r["number"]]
        paid_days = days[days >= 0]
        expected = sim.day0 + pd.Timedelta(days=float(np.median(paid_days))) if len(paid_days) else None
        if r["collection_method"] == "charge_automatically":
            profile = "Card payment failed, Stripe retrying"
        elif r["customer_id"] in hist_late.index:
            m = hist_late.loc[r["customer_id"], "mean"]
            profile = "Pays on time" if m <= 2 else f"Typically {int(round(m))} days late"
        else:
            profile = "New customer, no payment history"
        open_list.append(dict(invoice=r["number"], customer=cust.loc[r["customer_id"], "name"], segment=r["segment"],
                              amount=round(float(r["amount_eur"])), issued=d(r["invoiced_at"]),
                              due=d(r["due_date"]) if pd.notna(r["due_date"]) else d(r["invoiced_at"]),
                              daysOverdue=int(max(0, (AS_OF - r["due_date"]).days)) if pd.notna(r["due_date"]) else 0,
                              expectedPayDate=d(expected) if expected is not None else None,
                              pPaid30d=round(float(((days >= 0) & (days < 30)).mean()), 3), payerProfile=profile))

    # ---------------------------------------------------------------- scenarios
    def fy27_and_arr(s):
        mc = sm.monthly_cash(s)
        return mc[:, y2027].sum(axis=1).mean(), sm.total_mrr(s)[:, -1].mean() * 12
    base_rev, base_arr = fy27_and_arr(sm.run(ctx, n=2000, seed=11))
    lever_specs = [("selfServeRenewal", "Self-serve renewal rate", "pp", -10, 10, 1, "self_serve_renewal_pp", 5),
                   ("winRate", "Enterprise win rate", "pp", -10, 10, 1, "win_rate_pp", 5),
                   ("pipelineCreation", "Pipeline creation", "%", -50, 50, 5, "pipeline_creation_pct", 20),
                   ("newSelfServe", "New self-serve sign-ups", "%", -30, 30, 5, "new_self_serve_pct", 20),
                   ("dealSize", "Average new deal size", "%", -30, 30, 5, "deal_size_pct", 20)]
    levers = []
    for lid, label, unit, lo, hi, step, attr, delta in lever_specs:
        rev, arr = fy27_and_arr(sm.run(ctx, n=2000, seed=11, levers=sm.Levers(**{attr: delta})))
        levers.append(dict(id=lid, label=label, unit=unit, min=lo, max=hi, step=step, default=0,
                           impact=dict(fy2027Revenue=round((rev - base_rev) / delta), arrDec2027=round((arr - base_arr) / delta))))
    scenarios = dict(base=dict(fy2027Revenue=round(base_rev), arrDec2027=round(base_arr)), levers=levers)

    # ---------------------------------------------------------------- backtests
    backtest = []
    for bt in BACKTEST_DATES:
        a = pd.Timestamp(bt) + pd.Timedelta(hours=23, minutes=59, seconds=59)
        end = (a + pd.DateOffset(months=6)).normalize() + pd.offsets.MonthEnd(0)
        bctx = sm.build_context(raw, a, end)
        bsim = sm.run(bctx, n=1500, seed=3)
        fc = sm.monthly_cash(bsim).sum(axis=1)
        actual = float(cash_by_month(raw, (a + pd.Timedelta(days=1)).strftime("%Y-%m"), end.strftime("%Y-%m")).sum())
        last3 = cash_by_month(raw, (a - pd.DateOffset(months=2)).strftime("%Y-%m"), a.strftime("%Y-%m"))
        naive = float(last3.mean() * 6)
        bod = bctx.open_deals
        b = band(fc)
        backtest.append(dict(asOf=d(a), horizonMonths=6, actual=round(actual), forecast=b, naiveRunRate=round(naive),
                             hubspotWeighted=round(float((bod["amount_in_home_currency"] * bod["hubspot_prob"]).sum())) if len(bod) else 0,
                             errorPct=round(b["p50"] / actual - 1, 3), naiveErrorPct=round(naive / actual - 1, 3),
                             inBand=bool(b["p10"] <= actual <= b["p90"])))
        print(f"backtest {bt}: actual {actual:,.0f}  p50 {b['p50']:,.0f} [{b['p10']:,.0f}..{b['p90']:,.0f}]  naive {naive:,.0f}")

    out = dict(meta=dict(asOf=d(AS_OF), generatedAt=datetime.now(timezone.utc).isoformat(timespec="seconds"), currency="EUR",
                         simulations=N_SIMS, horizonEnd=HORIZON_END.strftime("%Y-%m")),
               kpis=kpis, monthly=monthly, bridge=bridge, mrrMovements=movements, cohorts=cohorts, renewalModel=renewal_model,
               renewals=renewals, deals=deals_out, dealModel=deal_model,
               cash=dict(weekly=weekly, openInvoices=open_list), backtest=backtest, identity=identity, scenarios=scenarios)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, indent=1, ensure_ascii=False, default=lambda o: o.item() if hasattr(o, "item") else str(o)))
    print(f"wrote {OUT} in {time.time() - t0:.1f}s")
    print(json.dumps(kpis, indent=1))


def risk(p):
    return "high" if p < 0.5 else "medium" if p < 0.75 else "low"


if __name__ == "__main__":
    main()
