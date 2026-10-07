# 5-minute demo script: Hamina revenue intelligence

Setup: dashboard open on **Forecast** (hamina-revops-demo.vercel.app). Claude open in a second tab with the Hamina connector added. Click **Generate brief** once before the call, so it loads instantly.
≈ 700 spoken words. **[Click]** = action on screen.

---

### 0:00 – 0:30 · Hook
"Mia mentioned you have a lot of Stripe, HubSpot and marketing data, but no bandwidth to use it. So I built what I'd build in my first months, on synthetic data shaped exactly like your Stripe and HubSpot APIs. It answers three questions: will we hit plan, which deals and renewals are real, and is marketing working?"

### 0:30 – 1:20 · Forecast (Finance, CFO)
**[Forecast page]**
"This is a Stripe-first forecast. Revenue means cash collected, the same definition as your public revenue chart. 4,000 simulations combine renewals, new self-serve, enterprise renewals, open deals and pipeline that doesn't exist yet."
"FY2026 lands at **€3.33M** against a €3.42M plan. That's roughly a **29% chance of hitting plan**. Finance can budget on P10, and sales can chase P90."
**[ARR bridge]** "ARR goes from €3.2M to about €6.1M by end of 2027, but half of that still has to be sold, and self-serve churn is the biggest leak at half a million."

### 1:20 – 2:10 · Pipeline reality check (Sales, CRO)
**[Pipeline page]**
"HubSpot says a deal in *Contract sent* is 80% likely. Rebuilt from deal history, the real number is about **27%**. The deal model is clearly better calibrated than stage percentages."
"So €3.2M of pipeline is really worth about €640k, not €790k. Each deal gets flags: close date pushed twice, no activity for three weeks, or *already paying us via self-serve*, which makes it a warm expansion account."

### 2:10 – 2:50 · Retention and cash (Customer success, Finance)
**[Retention page → renewals table]**
"Stripe sees churn before it happens: failed cards, seat reductions, late invoices. Aurelia Grand Hotels, €115k, renews next week and paid their last invoice a month late. Late payers renew 57% of the time, not 93%. That's a call this week."
**[Cash page]** "And the next 13 weeks of cash: €988k expected, with every open invoice dated from that customer's own payment habits. Grand Meridian is €85k overdue."

### 2:50 – 3:30 · Marketing (Marketing, GTM)
**[Marketing page]**
"Six ad platforms and 108 campaigns, joined to Stripe bookings and HubSpot deals. The key is **lag**: self-serve responds within a month, enterprise deals about three months later, enterprise revenue around eight."
"Paid media drives about **40% of self-serve bookings**, with €1.15 back per euro before renewals. I'm honest about the limit: channel-level credit needs holdout tests, and that's the next step I'd run with your marketing team."

### 3:30 – 4:00 · Scenarios and trust (COO)
**[Scenarios]** Drag *Enterprise win rate* +5. "Plus €0.56M FY2027. Board prep becomes 'what do we need to believe'."
**[Model trust]** "And it's backtested: re-run at five past dates with only the data known then. 14% average error versus 28% for a run-rate, and I show the one miss rather than hiding it."

### 4:00 – 4:30 · AI on top
**[Forecast → AI weekly brief]** "Every Monday this lands in Slack: where we stand against plan, and the four accounts to act on, each with an owner."
**[Claude tab]** Ask: *"Which three accounts should Mia call this week, and why?"* "And it's an MCP connector, so anyone can ask Claude in plain language, on top of the same numbers."

### 4:30 – 5:00 · Real world and close
"With your real data: 30 days to connect read-only APIs and reconcile with finance, 60 days to retrain and backtest the models and launch the Slack brief, 90 days to write scores back into HubSpot and add product usage to the churn model."
"What it gives each team:
- **Finance:** a forecast with ranges, and cash by week.
- **Sales:** honest deal odds.
- **Marketing:** spend measured in euros of revenue, not cost per lead.
- **RevOps:** one joined customer record.
- **COO:** one shared number, with less time spent on reporting.

That's the role as I see it. Happy to go deeper anywhere."

---

**If asked**
- *Data?* Synthetic, but 2022–2025 revenue matches Hamina's public chart; the schemas mirror the Stripe and HubSpot APIs.
- *Why not more ML?* Around 90 deals and 14 wins. Simple, well-calibrated models plus backtests beat complex ones at this scale.
- *Weakest part?* Stripe-only churn signals (AUC 0.63). Product usage data is the fix.
- *Stack?* Python, SQLite/DuckDB, scikit-learn, Next.js on Vercel, OpenAI for the brief, and a remote MCP server for Claude.
