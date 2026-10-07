// Series → colour mappings shared by server pages (legends, tables) and client charts.
// Kept out of "use client" modules so server components can read them as plain values.
import type { ForecastData } from "@/lib/types";
import { C } from "@/lib/chart";

type Comp = NonNullable<ForecastData["monthly"][number]["components"]>;

/** Stack order validated for adjacent-pair CVD separation: blue, teal, orange, violet, pink. */
export const COMPONENTS: { key: keyof Comp; label: string; color: string }[] = [
  { key: "existingSelfServe", label: "Existing self-serve", color: C.blue },
  { key: "newSelfServe", label: "New self-serve", color: C.teal },
  { key: "existingEnterprise", label: "Existing enterprise", color: C.orange },
  { key: "pipelineEnterprise", label: "Open pipeline", color: C.violet },
  { key: "futurePipeline", label: "Future pipeline", color: C.pink },
];

export const BRIDGE_COLORS = { total: C.inkSoft, increase: C.blue, decrease: C.pink };

export const MRR_SERIES = [
  { key: "new", label: "New", color: C.blue, sign: 1 },
  { key: "expansion", label: "Expansion", color: C.teal, sign: 1 },
  { key: "reactivation", label: "Reactivation", color: C.violet, sign: 1 },
  { key: "contraction", label: "Contraction", color: C.orange, sign: -1 },
  { key: "churn", label: "Churn", color: C.pink, sign: -1 },
] as const;

export const CASH_SERIES = [
  { key: "openInvoices", label: "Open invoices", color: C.blue },
  { key: "renewals", label: "Renewals", color: C.teal },
  { key: "newBusiness", label: "New business", color: C.orange },
] as const;
