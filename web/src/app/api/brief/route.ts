import OpenAI from "openai";
import { data } from "@/lib/data";

// Weekly RevOps brief written by an OpenAI model from the forecast snapshot.
// The snapshot only changes on redeploy, so one brief per instance per snapshot is enough:
// it keeps the demo fast and stops repeated clicks from spending tokens.

export const maxDuration = 60;

const MODEL = process.env.OPENAI_MODEL || "gpt-5.5";
const API_KEY = process.env.OPEN_AI_API_KEY || process.env.OPENAI_API_KEY;

const SYSTEM = `You are the RevOps analyst at Hamina Wireless (Wi-Fi planning SaaS). You write the weekly forecast brief for the CRO.
Write in Markdown, max ~250 words, plain business English, no preamble.
Structure:
**Headline** – one sentence: where FY2026 lands vs plan and what drives it.
**Forecast** – FY2026 and FY2027 P50 with the P10–P90 range; ARR now and expected Dec 2027.
**Act this week** – 3–4 bullets naming specific accounts or deals, the number at stake, and the concrete action (who should do what).
**Pipeline reality check** – how the model's view differs from HubSpot stage probabilities, in one or two sentences.
**Cash** – overdue receivables and expected inflow next 90 days.
Use only numbers from the JSON. Round money to €k or €M; write probabilities as percentages (0.21 → 21 %). Never invent accounts, people or figures.`;

function summary() {
  const k = data.kpis;
  const renewals = [...data.renewals]
    .sort((a, b) => b.arr * (1 - b.pRenew) - a.arr * (1 - a.pRenew))
    .slice(0, 6)
    .map((r) => ({ account: r.company ?? r.name, segment: r.segment, arr: r.arr, renewalDate: r.renewalDate, pRenew: r.pRenew, signals: r.signals, owner: r.owner }));
  const deals = [...data.deals]
    .sort((a, b) => b.amountEur * b.modelProb - a.amountEur * a.modelProb)
    .slice(0, 6)
    .map((d) => ({ deal: d.company, owner: d.owner, stage: d.stage, amountEur: d.amountEur, hubspotProb: d.hubspotProb, modelProb: d.modelProb, closeDateRep: d.closeDateRep, closeDateModel: d.closeDateModel, flags: d.flags }));
  const bigGaps = data.deals
    .filter((d) => d.hubspotProb - d.modelProb >= 0.3)
    .map((d) => ({ deal: d.company, stage: d.stage, amountEur: d.amountEur, hubspotProb: d.hubspotProb, modelProb: d.modelProb, flags: d.flags }));
  const overdue = data.cash.openInvoices.filter((i) => i.daysOverdue > 0);
  return {
    asOf: data.meta.asOf,
    kpis: k,
    arrBridge: data.bridge,
    stageCalibration: data.dealModel.stageCalibration,
    topRenewalRisks: renewals,
    topDealsByExpectedValue: deals,
    dealsHubspotOverstates: bigGaps,
    overdueInvoices: overdue,
    backtestAvgAbsErrorPct:
      data.backtest.reduce((s, b) => s + Math.abs(b.errorPct), 0) / Math.max(1, data.backtest.length),
  };
}

let cached: { key: string; markdown: string } | null = null;

export async function POST() {
  const key = data.meta.generatedAt;
  if (cached?.key === key) return Response.json({ markdown: cached.markdown, cached: true });

  if (!API_KEY) {
    return Response.json({ error: "OPEN_AI_API_KEY is not configured" }, { status: 503 });
  }

  try {
    const client = new OpenAI({ apiKey: API_KEY });
    const response = await client.responses.create({
      model: MODEL,
      instructions: SYSTEM,
      input: `Forecast snapshot:\n${JSON.stringify(summary())}`,
    });
    const markdown = response.output_text.trim();
    if (!markdown) return Response.json({ error: "Empty response" }, { status: 502 });

    cached = { key, markdown };
    return Response.json({ markdown });
  } catch (error) {
    if (error instanceof OpenAI.RateLimitError) {
      return Response.json({ error: "Rate limited, try again shortly" }, { status: 429 });
    }
    if (error instanceof OpenAI.APIError) {
      console.error("OpenAI API error", error.status, error.message);
      return Response.json({ error: "Brief generation failed" }, { status: 502 });
    }
    throw error;
  }
}
