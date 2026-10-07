# Hamina RevOps Forecast (demo)

A Stripe-first SaaS revenue forecast built on synthetic Stripe + HubSpot data, prepared as a demo for Hamina Wireless.
All customers, deals and payments are fabricated. Snapshot date: **2026-09-30**.

```
data/stripe/    synthetic Stripe export (2022 → Sep 2026), calibrated to Hamina's published revenue
data/hubspot/   synthetic HubSpot CRM (deals, stage/close-date history, engagements), linked to Stripe
pipeline/       forecast engine (Python): models, Monte Carlo, backtests → web/src/data/forecast.json
web/            Next.js dashboard (Vercel)
design/         Hamina design system notes + data contract
```

## How the forecast works

Revenue = cash collected (charges − refunds), the same definition as Hamina's revenue chart. ARR = month-end MRR × 12.

| Component | Source | Method |
|---|---|---|
| Existing self-serve | Stripe | Renewal model (logistic regression on Stripe-only signals: plan, tenure, seats, failed/late payments, channel) + scheduled cancellations + empirical seat expansion |
| New self-serve | Stripe | Seasonal, damped log-linear trend on monthly sign-ups; purchase mix sampled from the last 12 months |
| Existing enterprise | Stripe | Contract renewal dates; renewal probability from payment behaviour (late payers renew far less), Beta-smoothed on history; historical price uplift |
| Open pipeline | HubSpot | Deal win model trained on monthly snapshots rebuilt from property history (stage, time in stage, activity, close-date pushes, contacts, source, size); close-date slip sampled from won deals |
| Future pipeline | HubSpot | Recent deal-creation rate × historical win rate, cycle length and deal size |
| Receivables | Stripe | Open invoices paid on each customer's historical payment delay |

Every component is simulated 4,000 times → P10 / P50 / P90 per month. Everything is computed **as of** a date using
only data known then, so the same code produces honest out-of-time backtests (`backtest` in the JSON).

Stripe ↔ HubSpot identity resolution: email domain → contact email domain → fuzzy company name.

## Run it

```bash
python3 data/stripe/generate_stripe_data.py      # Stripe data
python3 data/hubspot/generate_hubspot_data.py    # HubSpot data (reads the Stripe DB)
pip install -r pipeline/requirements.txt
python3 pipeline/build.py                        # → web/src/data/forecast.json
cd web && npm install && npm run dev
```

The AI weekly brief needs `ANTHROPIC_API_KEY` in the environment (Vercel: Project → Settings → Environment Variables).

## Swapping in real data

The generators write tables shaped like Stripe API objects and HubSpot CRM v3 objects (with `propertiesWithHistory`).
Replace `pipeline/data.py:load()` with Stripe / HubSpot API pulls into the same frames; nothing downstream changes.
