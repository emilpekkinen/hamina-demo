# Project notes: Hamina RevOps forecast demo

Demo for a RevOps/GTM Engineer interview at Hamina Wireless. Goal: show that Stripe + HubSpot (+ ad) data they already have can drive a trustworthy revenue forecast.
Live: https://hamina-revops-demo.vercel.app · Code: https://github.com/emilpekkinen/hamina-demo · Snapshot date: 2026-09-30.

## What was built (in order)

| Step | What | Why |
|---|---|---|
| 1 | Extended the existing synthetic Stripe data from 2025-12 to **2026-09-30** | Demo is in Oct 2026; the forecast must look forward from "today" |
| 2 | Hidden customer **health score** → renewal, visible beforehand as failed payments, seat cuts, late invoices | Real churn has leading signals; the model needs something to find |
| 3 | Invoice-billed self-serve teams + enterprise net 30/45/60 terms + late payers | Enables cash forecast and payment-behaviour risk |
| 4 | **HubSpot generator**: 107 deals (€50–300k), stage + close-date history, engagements, owners | Pipeline forecast needs point-in-time history, not just current state |
| 5 | Stripe↔HubSpot link: every Stripe enterprise customer = a closed-won deal; some names/domains differ on purpose | Shows identity resolution, a real RevOps pain |
| 6 | Python pipeline (`pipeline/`): renewal model, deal model, Monte Carlo (4,000 runs), backtests | Probabilistic forecast (P10/P50/P90) + proof it works |
| 7 | Next.js dashboard in Hamina's design system (extracted from hamina.com / eu.hamina.com) | Looks like their product; Vercel hosting |
| 8 | AI weekly brief (OpenAI Responses API, `OPEN_AI_API_KEY`, default `gpt-5.5`) | "No bandwidth" problem → brief written for the CRO |
| 9 | **Marketing**: 6 ad platforms, 108 campaigns, weekly stats; spend drives acquisition timing with lag; lag scan + MMM; `/marketing` view; "Paid marketing budget" scenario lever | Connect spend to new revenue, with honest lag handling |
| 10 | **Remote MCP server** at `/api/mcp` (12 read-only tools, Streamable HTTP via `mcp-handler`) | Demo the model from inside Claude (custom connector) |
| 11 | **Pitch deck PDF** (`deck/`, Hamina styling, 15 slides) + **5-min script** (`deck/demo-script.md`) | Email follow-up; live demo flow |

## Key design decisions
- **Stripe-first**: Stripe = source of truth for revenue/base; HubSpot only for new-logo pipeline. Revenue = cash (charges − refunds), the same definition as Hamina's public chart.
- **Everything "as of" a date**: same code produces today's forecast and out-of-time backtests (no leakage).
- **Simple, regularised models**: ~90 closed deals and 14 wins don't justify heavy ML. Logistic regression (C=0.05 deals, 0.1 renewals), Beta prior for enterprise renewals.
- **Enterprise renewal = rule, not model**: 14 customers. Late payment >10 days → 57% renew vs 93%.
- **Synthetic yearly totals stay calibrated** to Hamina's public revenue (2022–2025 exact). 2026 plan €3.42M (+61%), our assumption.
- **Marketing affects timing within the year, not yearly totals** (keeps revenue calibration). Paid ≈ 6–7% of revenue per benchmarks (`design/marketing-research.md`).
- AI brief cached per deployment (keyed on snapshot) → instant and free on repeat clicks.

## Results (current snapshot)
- ARR €3.17M (+66% YoY), NRR ~84%, GRR ~78%.
- FY2026 P50 ≈ €3.3M vs plan €3.42M → plan at the optimistic end. FY2027 P50 ≈ €5.9M.
- Deal model AUC 0.86, Brier 0.11 vs HubSpot stage % 0.18. "Contract sent" closes ~27%, not 80%.
- Renewal model AUC 0.63 (Stripe-only), top-decile churn 45% vs 27% average (1.65×).
- Backtests: 4/5 inside P10–P90 (mid-2025 missed −37%: two large H2 wins underrated), avg abs error 14% vs naive run-rate 28%.
- Marketing: ~41% of self-serve new bookings attributable to paid; €1.15 first-invoice bookings per €1 (before renewals); carry-over half-life ~1.6 months. Enterprise deals respond ~2–3 months after LinkedIn/search spend, revenue ~8 months after.

## Learnings
- **Point-in-time history is the hard part.** HubSpot property history (stage, close date) is what makes deal models and backtests possible. Without it, no honest backtest.
- **HubSpot stage probabilities are badly miscalibrated** at late stages. Biggest quick win for a CRO.
- **Stripe-only churn signals are weak** (AUC ~0.6). Most churn happens at the first renewal, before Stripe has seen any signal. Product usage is the obvious next feature.
- **Small enterprise samples → rules + priors**, and say so.
- **Backtests keep you honest**: tuning to make every backtest pass would be overfitting. One miss is reported as-is.
- **MMM channel attribution was unstable**: always-on search barely varies, LinkedIn bursts coincide with seasonal peaks → bursty channels absorb seasonality. Reported total paid effect only; channel split needs geo or holdout tests.
- **Detrend before correlating**: spend and revenue both grow, so raw correlation credits ads for growth.
- **Lag matters**: self-serve responds in 0–1 month, enterprise deals in ~2–3, enterprise revenue ~8. Monthly ROAS on enterprise spend is meaningless.
- Platform-reported conversions ≠ revenue impact (CPL ranges €90–540 by channel).
- Deck = local PDF (HTML → Chrome print), not a published page: it uses Hamina branding, so it's labelled as prepared by Emil, synthetic data, not an official Hamina document.
- Ops gotchas: the Vercel env value picked up quotes from `.env.local` (stripped them); a server component can't import constants from a `"use client"` file.

## Run
See `README.md`. Order: marketing → Stripe → HubSpot generators → `python3 pipeline/build.py` → `cd web && npm run build`.

## Not done / next
- Real API connectors (Stripe, HubSpot, ad platforms) replacing `pipeline/data.py:load()`.
- Product usage data in the renewal model; HubSpot write-back of deal scores; scheduled weekly Slack brief.
- Channel-level incrementality tests.
