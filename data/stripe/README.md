# Hamina Wireless — synthetic Stripe data (DEMO)

Fabricated Stripe data for Feb 2022 – Sep 2026. 2022–2025 are calibrated so yearly revenue matches Hamina's published
revenue chart; 2026 assumes ~+61 % growth (full-year plan €3.42M) and only January–September exists.
All customers, organisations, emails and payments are invented. Emails use the reserved `.example` TLD so
nothing can reach a real mailbox.

## Files

| Path | What |
| --- | --- |
| `hamina_stripe.db` | SQLite database (tables + views) |
| `csv/` | One CSV per table, plus the main views (`v_transactions`, `v_revenue_by_year`, `v_revenue_by_month`, `v_mrr_by_month`) |
| `schema.sql` | Table, index and view definitions |
| `generate_stripe_data.py` | Deterministic generator (stdlib only, `SEED = 53`). Re-run to rebuild the DB and CSVs |

## Revenue calibration

Revenue = successful charges − refunds, per calendar year (UTC), no VAT.

| Year | Chart | Data (EUR) | Self-serve | Enterprise |
| --- | --- | --- | --- | --- |
| 2022 | 0,1 M | 57,975 | 57,975 | – |
| 2023 | 0,5 M | 504,058 | 259,058 | 245,000 |
| 2024 | 1,1 M | 1,114,943 | 539,943 | 575,000 |
| 2025 | 2,1 M | 2,119,056 | 841,056 | 1,278,000 |

2025 vs 2024 = +90 %. Targets live in `REVENUE_TARGETS` at the top of the generator. The 2022 value follows
the bar height in the chart (~0.06 M, which the chart labels as 0,1); change it to `100_000` if you prefer the label.

## What is modelled

- **Self-serve licenses** (~1,300 customers): 6-month €599 and 12-month €980 subscriptions, 1–5 seats, paid by card
  or SEPA debit. Buyers are network consultants, IT leads and heads of wireless (`customers.persona`).
  Includes renewals, churn, 6→12-month upgrades, seat changes, declined/expired cards with retries,
  involuntary churn, refunds and scheduled cancellations.
- **Enterprise contracts** (14 customers): annual custom deals of €70k–€299k with universities,
  factories, hospitals and hotels, invoiced net 30–60 and paid by bank transfer. Includes renewals with uplift, two churned accounts and open invoices at the snapshot.
- **Churn signals**: a hidden per-customer health score drives renewal and also shows up in Stripe beforehand (failed
  payments, seat reductions, late invoice payments, acquisition channel). Some team buyers pay by invoice (net 14/30) and some pay late.
  Enterprise contracts have net 30/45/60 terms; late payment before renewal is the enterprise churn signal.
- Snapshot moment is 2026-09-30 23:59:59 UTC: subscription statuses (`active`, `past_due`, `canceled`) are as of then.

## Schema

Tables mirror Stripe objects: `products`, `prices`, `customers`, `subscriptions`, `invoices`,
`invoice_line_items`, `charges`, `refunds`, `balance_transactions`.
As in Stripe, amounts are integer cents, timestamps are Unix seconds (UTC). Views expose EUR amounts and ISO dates.

Segmentation columns that Stripe would keep in `metadata` are also flattened onto `customers`:
`segment`, `persona`, `industry`, `acquisition_channel`, `account_owner`, `company_name`, `job_title`.

## Example queries

```bash
sqlite3 -header -column hamina_stripe.db "SELECT * FROM v_revenue_by_year;"
sqlite3 -header -column hamina_stripe.db "SELECT * FROM v_revenue_by_year_plan;"
sqlite3 -header -column hamina_stripe.db "SELECT * FROM v_mrr_by_month;"
sqlite3 -header -column hamina_stripe.db "SELECT * FROM v_transactions WHERE segment = 'enterprise' ORDER BY charged_at;"
```
