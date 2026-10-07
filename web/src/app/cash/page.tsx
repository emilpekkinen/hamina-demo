import type { Metadata } from "next";
import { CashWeeklyChart } from "@/components/charts/CashWeeklyChart";
import { Card, CardHeader, Empty, KpiCard, Legend, PageHeader, Pill, TableView, TableWrap, cx, td, tdNum, th } from "@/components/ui";
import { C } from "@/lib/chart";
import { data } from "@/lib/data";
import { dateLabel, eur, num, pct } from "@/lib/format";
import { CASH_SERIES } from "@/lib/series";

export const metadata: Metadata = { title: "Cash · Hamina RevOps (demo)" };

export default function CashPage() {
  const { cash, kpis } = data;
  const weekly = cash.weekly;
  const invoices = [...cash.openInvoices].sort((a, b) => b.daysOverdue - a.daysOverdue || b.amount - a.amount);
  const open = invoices.reduce((s, i) => s + i.amount, 0);
  const overdueN = invoices.filter((i) => i.daysOverdue > 0).length;
  const expected30 = invoices.reduce((s, i) => s + i.amount * i.pPaid30d, 0);
  const totals = CASH_SERIES.map((s) => ({ ...s, total: weekly.reduce((t, w) => t + (w.components[s.key] ?? 0), 0) }));
  const first = weekly[0]?.weekStart;
  const last = weekly[weekly.length - 1]?.weekStart;

  return (
    <>
      <PageHeader
        eyebrow="Cash"
        title="Cash coming in, week by"
        accent="week"
        lead="Thirteen-week inflow forecast from open invoices (per-payer payment behaviour), upcoming renewals (renewal model) and new business (deal model)."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Next 90 days · P50"
          highlight
          value={eur(kpis.cashNext90d.p50)}
          sub={`P10–P90 ${eur(kpis.cashNext90d.p10)} – ${eur(kpis.cashNext90d.p90)}`}
        />
        {totals.map((t) => (
          <KpiCard
            key={t.key}
            label={`From ${t.label.toLowerCase()}`}
            value={eur(t.total)}
            sub={
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-[3px]" style={{ background: t.color }} aria-hidden />
                {pct(t.total / Math.max(1, totals.reduce((s, x) => s + x.total, 0)))} of expected inflow
              </span>
            }
          />
        ))}
      </div>

      <Card className="mt-4">
        <CardHeader
          title="Expected weekly cash inflows"
          subtitle={first ? `${weekly.length} weeks from ${dateLabel(first)} to ${dateLabel(last)}. Whiskers show the P10–P90 range of the weekly total.` : undefined}
        />
        <Legend
          className="mb-3"
          items={[
            ...CASH_SERIES.map((s) => ({ label: s.label, color: s.color })),
            { label: "P10–P90 of total", color: C.ink, kind: "line" as const },
          ]}
        />
        {weekly.length ? <CashWeeklyChart weekly={weekly} /> : <Empty>No weekly cash forecast in this snapshot.</Empty>}
        <TableView
          columns={["Week of", ...CASH_SERIES.map((s) => s.label), "P10", "P50", "P90"]}
          rows={weekly.map((w) => [
            dateLabel(w.weekStart),
            ...CASH_SERIES.map((s) => eur(w.components[s.key])),
            eur(w.expected.p10),
            eur(w.expected.p50),
            eur(w.expected.p90),
          ])}
        />
      </Card>

      <Card className="mt-4">
        <CardHeader
          title="Open and overdue invoices"
          subtitle="Expected pay date from each payer's history. P(paid in 30 d) feeds the open-invoice component above."
          right={
            <div className="flex flex-wrap gap-2 text-xs">
              <Pill>{num(invoices.length)} open · {eur(open)}</Pill>
              <Pill tone={overdueN ? "error" : "success"}>
                {num(overdueN)} overdue · {eur(kpis.overdueReceivables)}
              </Pill>
              <Pill tone="brand">{eur(expected30)} expected within 30 d</Pill>
            </div>
          }
        />
        {invoices.length === 0 ? (
          <Empty>No open invoices.</Empty>
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <th className={th}>Invoice</th>
                <th className={th}>Customer</th>
                <th className={cx(th, "text-right")}>Amount</th>
                <th className={th}>Issued</th>
                <th className={th}>Due</th>
                <th className={th}>Status</th>
                <th className={th}>Expected pay date</th>
                <th className={cx(th, "text-right")}>P(paid 30 d)</th>
                <th className={th}>Payer profile</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((i) => (
                <tr key={i.invoice} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className={cx(td, "whitespace-nowrap font-mono text-xs text-gray-600")}>{i.invoice}</td>
                  <td className={td}>
                    <div className="font-medium text-gray-900">{i.customer}</div>
                    <div className="text-xs text-gray-500">{i.segment === "enterprise" ? "Enterprise · invoice" : "Self-serve · Stripe"}</div>
                  </td>
                  <td className={tdNum}>{eur(i.amount)}</td>
                  <td className={cx(td, "whitespace-nowrap tabular")}>{dateLabel(i.issued, true)}</td>
                  <td className={cx(td, "whitespace-nowrap tabular")}>{dateLabel(i.due, true)}</td>
                  <td className={td}>
                    {i.daysOverdue > 0 ? (
                      <Pill tone={i.daysOverdue > 30 ? "error" : "warning"}>{num(i.daysOverdue)} days overdue</Pill>
                    ) : (
                      <Pill tone="neutral">Not due</Pill>
                    )}
                  </td>
                  <td className={cx(td, "whitespace-nowrap tabular font-medium text-gray-900")}>{dateLabel(i.expectedPayDate)}</td>
                  <td className={tdNum}>
                    <span className="inline-flex items-center gap-2">
                      <span className="hidden h-1.5 w-12 overflow-hidden rounded-full bg-gray-100 sm:inline-block" aria-hidden>
                        <span
                          className="block h-full rounded-full"
                          style={{ width: `${Math.round(i.pPaid30d * 100)}%`, background: C.blue }}
                        />
                      </span>
                      {pct(i.pPaid30d)}
                    </span>
                  </td>
                  <td className={cx(td, "whitespace-nowrap")}>
                    <Pill tone={/on time/i.test(i.payerProfile) ? "success" : /fail|30\+/i.test(i.payerProfile) ? "error" : "warning"}>
                      {i.payerProfile}
                    </Pill>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>
    </>
  );
}
