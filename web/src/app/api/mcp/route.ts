import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { data } from "@/lib/data";

// Remote MCP server (Streamable HTTP) over the same forecast snapshot the dashboard shows.
// Add https://<host>/api/mcp as a custom connector in Claude. Read-only, synthetic demo data.

const json = (value: unknown, note?: string) => ({
  content: [{ type: "text" as const, text: (note ? `${note}\n\n` : "") + JSON.stringify(value, null, 1) }],
});

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const matches = (hay: string, needle: string) => norm(hay).includes(norm(needle));

const INSTRUCTIONS = `Hamina Wireless RevOps forecast (DEMO, synthetic data, snapshot ${data.meta.asOf}).
Revenue = cash collected (Stripe charges − refunds); ARR = month-end MRR × 12; money in EUR.
Forecasts are Monte Carlo P10/P50/P90. Deal "modelProb" comes from a deal model trained on HubSpot history;
"hubspotProb" is the CRM stage probability. Start with get_forecast_overview, then drill down.`;

const handler = createMcpHandler(
  (server) => {
    server.registerTool(
      "get_forecast_overview",
      {
        title: "Forecast overview",
        description: "Headline KPIs: ARR, NRR/GRR, FY2026 vs plan, FY2027, Dec-2027 ARR, open pipeline, 90-day cash, plus the ARR bridge to Dec 2027.",
        inputSchema: z.object({}),
      },
      async () => json({ meta: data.meta, kpis: data.kpis, arrBridge: data.bridge }),
    );

    server.registerTool(
      "get_monthly_forecast",
      {
        title: "Monthly revenue and ARR",
        description: "Monthly cash revenue and ARR: actuals before the snapshot, P10/P50/P90 bands and component split after it.",
        inputSchema: z.object({
          from: z.string().regex(/^\d{4}-\d{2}$/).optional().describe("First month, YYYY-MM"),
          to: z.string().regex(/^\d{4}-\d{2}$/).optional().describe("Last month, YYYY-MM"),
        }),
      },
      async ({ from, to }) =>
        json(data.monthly.filter((m) => (!from || m.month >= from) && (!to || m.month <= to))),
    );

    server.registerTool(
      "list_open_deals",
      {
        title: "Open pipeline",
        description: "Open HubSpot deals with HubSpot stage probability vs modelled win probability, rep vs modelled close date and risk flags.",
        inputSchema: z.object({
          owner: z.string().optional().describe("Filter by owner name (partial match)"),
          stage: z.string().optional().describe("Filter by stage label, e.g. 'Contract sent'"),
          minAmountEur: z.number().optional(),
          flaggedOnly: z.boolean().optional().describe("Only deals with risk flags"),
          sortBy: z.enum(["expected", "amount", "overstatement"]).optional()
            .describe("expected = amount × model prob; overstatement = HubSpot prob − model prob"),
          limit: z.number().int().min(1).max(50).optional(),
        }),
      },
      async ({ owner, stage, minAmountEur, flaggedOnly, sortBy = "expected", limit = 15 }) => {
        const key = {
          expected: (d: (typeof data.deals)[number]) => d.amountEur * d.modelProb,
          amount: (d: (typeof data.deals)[number]) => d.amountEur,
          overstatement: (d: (typeof data.deals)[number]) => d.hubspotProb - d.modelProb,
        }[sortBy];
        const rows = data.deals
          .filter((d) => (!owner || matches(d.owner, owner)) && (!stage || matches(d.stage, stage))
            && (minAmountEur == null || d.amountEur >= minAmountEur) && (!flaggedOnly || d.flags.length > 0))
          .sort((a, b) => key(b) - key(a));
        const sum = (f: (d: (typeof rows)[number]) => number) => Math.round(rows.reduce((s, d) => s + f(d), 0));
        return json({
          count: rows.length,
          totalAmountEur: sum((d) => d.amountEur),
          hubspotWeightedEur: sum((d) => d.amountEur * d.hubspotProb),
          modelExpectedEur: sum((d) => d.amountEur * d.modelProb),
          deals: rows.slice(0, limit),
        });
      },
    );

    server.registerTool(
      "get_account",
      {
        title: "Look up an account",
        description: "Everything known about a company: open deals, upcoming renewal and risk signals, open invoices.",
        inputSchema: z.object({ name: z.string().describe("Company or customer name (partial match)") }),
      },
      async ({ name }) => {
        const deals = data.deals.filter((d) => matches(d.company, name) || matches(d.name, name));
        const renewals = data.renewals.filter((r) => matches(r.company ?? "", name) || matches(r.name, name));
        const invoices = data.cash.openInvoices.filter((i) => matches(i.customer, name));
        if (!deals.length && !renewals.length && !invoices.length) {
          return json({ found: false }, `No open deal, upcoming renewal or open invoice matches "${name}".`);
        }
        return json({ found: true, deals, renewals, openInvoices: invoices });
      },
    );

    server.registerTool(
      "list_renewal_risks",
      {
        title: "Upcoming renewals at risk",
        description: "Renewals in the next 180 days with modelled renewal probability, ARR at risk and the Stripe signals behind it.",
        inputSchema: z.object({
          segment: z.enum(["self_serve", "enterprise"]).optional(),
          riskLevel: z.enum(["high", "medium", "low"]).optional(),
          withinDays: z.number().int().min(1).max(180).optional(),
          limit: z.number().int().min(1).max(50).optional(),
        }),
      },
      async ({ segment, riskLevel, withinDays, limit = 15 }) => {
        const asOf = new Date(data.meta.asOf).getTime();
        const rows = data.renewals
          .filter((r) => (!segment || r.segment === segment) && (!riskLevel || r.riskLevel === riskLevel)
            && (!withinDays || new Date(r.renewalDate).getTime() - asOf <= withinDays * 86_400_000))
          .map((r) => ({ ...r, arrAtRisk: Math.round(r.arr * (1 - r.pRenew)) }))
          .sort((a, b) => b.arrAtRisk - a.arrAtRisk);
        const sc = (data.kpis as unknown as { scheduledCancellations?: unknown }).scheduledCancellations;
        return json({ count: rows.length, scheduledCancellationsNext180d: sc, renewals: rows.slice(0, limit) });
      },
    );

    server.registerTool(
      "get_cash_outlook",
      {
        title: "Cash outlook",
        description: "Expected weekly cash inflows for the next 13 weeks (P10/P50/P90) and open/overdue invoices with expected pay dates.",
        inputSchema: z.object({ overdueOnly: z.boolean().optional() }),
      },
      async ({ overdueOnly }) =>
        json({
          next90Days: data.kpis.cashNext90d,
          overdueReceivables: data.kpis.overdueReceivables,
          weekly: data.cash.weekly,
          openInvoices: data.cash.openInvoices.filter((i) => !overdueOnly || i.daysOverdue > 0),
        }),
    );

    server.registerTool(
      "get_retention",
      {
        title: "Retention",
        description: "NRR/GRR, recent MRR movements, self-serve cohort retention and renewal-model drivers.",
        inputSchema: z.object({ months: z.number().int().min(1).max(48).optional().describe("MRR movement months to return (default 12)") }),
      },
      async ({ months = 12 }) =>
        json({
          nrr12m: data.kpis.nrr12m,
          grr12m: data.kpis.grr12m,
          mrrMovements: data.mrrMovements.slice(-months),
          cohorts: data.cohorts,
          renewalModel: data.renewalModel,
        }),
    );

    server.registerTool(
      "get_marketing_performance",
      {
        title: "Marketing performance",
        description: "Paid spend by year and channel, CPC/CTR/cost per conversion, lagged spend→revenue correlations, and the marketing mix model (share of bookings from paid, carry-over, return per €).",
        inputSchema: z.object({}),
      },
      async () => {
        const m = data.marketing;
        if (!m) return json({ available: false });
        const { yearly, channels, lag, mmm, enterprise } = m;
        return json({ yearly, channels, lag, mmm, enterprise });
      },
    );

    server.registerTool(
      "list_campaigns",
      {
        title: "Ad campaigns",
        description: "Paid campaigns with platform, type (always-on/burst), target segment, flight dates, spend, clicks, conversions.",
        inputSchema: z.object({
          platform: z.string().optional().describe("e.g. 'LinkedIn', 'Google'"),
          year: z.number().int().optional(),
          segment: z.enum(["self_serve", "enterprise"]).optional(),
          limit: z.number().int().min(1).max(100).optional(),
        }),
      },
      async ({ platform, year, segment, limit = 20 }) => {
        const rows = (data.marketing?.campaigns ?? []).filter((c) =>
          (!platform || matches(c.platform, platform)) && (!year || c.start.startsWith(String(year)))
          && (!segment || c.segment === segment));
        return json({ count: rows.length, totalSpendEur: Math.round(rows.reduce((s, c) => s + c.spend, 0)), campaigns: rows.slice(0, limit) });
      },
    );

    const leverIds = data.scenarios.levers.map((l) => l.id);
    server.registerTool(
      "run_scenario",
      {
        title: "What-if scenario",
        description: `Change forecast levers and get FY2027 revenue and Dec-2027 ARR vs base (linearised from Monte Carlo runs). Levers: ${data.scenarios.levers
          .map((l) => `${l.id} (${l.label}, ${l.unit}, ${l.min}..${l.max})`).join("; ")}.`,
        inputSchema: z.object({
          levers: z.record(z.string(), z.number()).describe(`Map of lever id → change, e.g. {"winRate": 5, "marketingBudget": 20}. Valid ids: ${leverIds.join(", ")}`),
        }),
      },
      async ({ levers }) => {
        const { base } = data.scenarios;
        let rev = base.fy2027Revenue, arr = base.arrDec2027;
        const applied: Record<string, number> = {};
        const unknown: string[] = [];
        for (const [id, raw] of Object.entries(levers)) {
          const l = data.scenarios.levers.find((x) => x.id === id);
          if (!l) { unknown.push(id); continue; }
          const v = Math.min(l.max, Math.max(l.min, raw));
          applied[id] = v;
          rev += l.impact.fy2027Revenue * v;
          arr += l.impact.arrDec2027 * v;
        }
        return json({
          applied, unknownLevers: unknown, base,
          scenario: { fy2027Revenue: Math.round(rev), arrDec2027: Math.round(arr) },
          delta: { fy2027Revenue: Math.round(rev - base.fy2027Revenue), arrDec2027: Math.round(arr - base.arrDec2027) },
          note: "Linear approximation around the base case; values are expected (mean) outcomes.",
        });
      },
    );

    server.registerTool(
      "get_model_trust",
      {
        title: "Model trust",
        description: "Out-of-time backtests (forecast vs actual vs naive run-rate) and model quality: deal model vs HubSpot calibration, renewal model AUC.",
        inputSchema: z.object({}),
      },
      async () =>
        json({
          backtest: data.backtest,
          dealModel: data.dealModel,
          renewalModel: { aucTest: data.renewalModel.aucTest, lift: data.renewalModel.lift, testPeriod: data.renewalModel.testPeriod },
        }),
    );

    server.registerTool(
      "get_data_lineage",
      {
        title: "Data sources and identity resolution",
        description: "How Stripe customers are matched to HubSpot companies (domain, contact email, fuzzy name) and what each source contributes.",
        inputSchema: z.object({}),
      },
      async () =>
        json({
          sources: {
            stripe: "Subscriptions, invoices, charges, refunds (revenue truth, renewals, payment behaviour)",
            hubspot: "Companies, contacts, deals with stage/close-date history, engagements (pipeline)",
            adPlatforms: "Google, LinkedIn, Meta, YouTube, Capterra/G2, Reddit weekly campaign stats (marketing)",
          },
          identity: data.identity,
        }),
    );
  },
  {
    serverInfo: { name: "hamina-revops-demo", version: "1.0.0" },
    instructions: INSTRUCTIONS,
  },
);

export { handler as GET, handler as POST };
