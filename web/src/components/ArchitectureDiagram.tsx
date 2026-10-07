import type { ReactNode } from "react";
import { ArrowRight, Boxes, Megaphone, Brain, CreditCard, Database, GitMerge, LayoutDashboard, MessageSquare, Send, Shuffle, Target, Users } from "lucide-react";

type Node = { title: string; sub: string; icon: ReactNode; tone?: "brand" | "plain" | "accent" };

const Icon = ({ children }: { children: ReactNode }) => (
  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-gray-50 text-gray-700">{children}</span>
);

const COLUMNS: { label: string; nodes: Node[] }[] = [
  {
    label: "Sources",
    nodes: [
      { title: "Stripe API", sub: "Subscriptions, invoices, payments", icon: <CreditCard size={16} strokeWidth={1.5} /> },
      { title: "HubSpot API", sub: "Companies, deals, deal history", icon: <Users size={16} strokeWidth={1.5} /> },
      { title: "Ad platform APIs", sub: "Google, LinkedIn, Meta, YouTube, G2, Reddit", icon: <Megaphone size={16} strokeWidth={1.5} /> },
    ],
  },
  {
    label: "Warehouse",
    nodes: [{ title: "SQLite / DuckDB", sub: "Raw + modelled tables", icon: <Database size={16} strokeWidth={1.5} /> }],
  },
  {
    label: "Identity",
    nodes: [{ title: "Identity resolution", sub: "Domain → contact email → fuzzy name", icon: <GitMerge size={16} strokeWidth={1.5} /> }],
  },
  {
    label: "Models",
    nodes: [
      { title: "Renewal model", sub: "P(renew) per customer", icon: <Shuffle size={16} strokeWidth={1.5} /> },
      { title: "Deal model", sub: "P(win), close date per deal", icon: <Target size={16} strokeWidth={1.5} /> },
      { title: "Monte Carlo", sub: "Revenue, ARR, cash bands", icon: <Brain size={16} strokeWidth={1.5} />, tone: "brand" },
    ],
  },
  {
    label: "Outputs",
    nodes: [
      { title: "This app", sub: "forecast.json → Next.js", icon: <LayoutDashboard size={16} strokeWidth={1.5} />, tone: "accent" },
      { title: "Slack brief", sub: "Weekly AI summary", icon: <MessageSquare size={16} strokeWidth={1.5} /> },
      { title: "HubSpot write-back", sub: "Model prob + risk flags on records", icon: <Send size={16} strokeWidth={1.5} /> },
    ],
  },
];

export function ArchitectureDiagram() {
  return (
    <div>
      <div className="flex flex-col items-stretch gap-2 lg:flex-row lg:items-center">
        {COLUMNS.map((col, ci) => (
          <div key={col.label} className="flex flex-col items-stretch gap-2 lg:flex-1 lg:flex-row lg:items-center">
            <div className="min-w-0 flex-1">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                <span className="mr-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-gray-100 text-[10px] text-gray-900">
                  {ci + 1}
                </span>
                {col.label}
              </p>
              <div className="space-y-2">
                {col.nodes.map((n) => (
                  <div
                    key={n.title}
                    className={
                      n.tone === "brand"
                        ? "flex items-start gap-2.5 rounded-lg border border-indigo-100 bg-indigo-50 p-2.5"
                        : n.tone === "accent"
                          ? "flex items-start gap-2.5 rounded-lg border border-blue-500 bg-white p-2.5 shadow-soft"
                          : "flex items-start gap-2.5 rounded-lg border border-gray-200 bg-white p-2.5"
                    }
                  >
                    <Icon>{n.icon}</Icon>
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold leading-5 text-gray-900">{n.title}</p>
                      <p className="text-[11px] leading-4 text-gray-500">{n.sub}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {ci < COLUMNS.length - 1 && (
              <div className="flex items-center justify-center text-blue-500 lg:pt-6" aria-hidden>
                <ArrowRight size={18} strokeWidth={1.75} className="rotate-90 lg:rotate-0" />
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="mt-5 flex items-start gap-2.5 rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 py-3 text-[13px] text-gray-600">
        <Boxes size={16} strokeWidth={1.5} className="mt-0.5 shrink-0 text-blue-500" aria-hidden />
        <span>
          <strong className="text-gray-900">Swap synthetic generators for API keys.</strong> The demo runs on generated
          Stripe and HubSpot data with the same schemas as the real APIs; pointing the loaders at live keys is the only
          change needed.
        </span>
      </div>
    </div>
  );
}
