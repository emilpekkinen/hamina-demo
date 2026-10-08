import { BandMeter } from "@/components/BandMeter";
import { BriefCard } from "@/components/BriefCard";
import { ArrChart } from "@/components/charts/ArrChart";
import { BridgeChart } from "@/components/charts/BridgeChart";
import { ComponentsChart } from "@/components/charts/ComponentsChart";
import { RevenueFanChart } from "@/components/charts/RevenueFanChart";
import { Card, CardHeader, DeltaPill, Empty, KpiCard, Legend, PageHeader, TableView } from "@/components/ui";
import { C } from "@/lib/chart";
import { BRIDGE_COLORS, COMPONENTS } from "@/lib/series";
import { asOfMonth, data, pipelineBrief } from "@/lib/data";
import { dateLabel, eur, monthLabel, num, pct } from "@/lib/format";

export default function OverviewPage() {
  const { kpis, monthly, bridge, meta } = data;
  const aom = asOfMonth();
  const fy26 = kpis.fy2026;
  const vsPlan = fy26.plan ? fy26.p50 / fy26.plan - 1 : 0;
  const fy27Growth = fy26.p50 ? kpis.fy2027.p50 / fy26.p50 - 1 : 0;
  const hasForecast = monthly.some((m) => m.revenue);
  const hasComponents = monthly.some((m) => m.components);

  return (
    <>
      <PageHeader
        eyebrow="Forecast overview"
        title="Where revenue is"
        accent="heading"
        lead={
          <>
            Self-serve (Stripe) and enterprise (HubSpot) revenue in one probabilistic forecast:{" "}
            {num(meta.simulations)} Monte Carlo runs through {monthLabel(meta.horizonEnd)}. Bands show the P10–P90
            range, the line is the median.
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-5">
        <KpiCard
          label="ARR"
          value={eur(kpis.arr)}
          delta={<DeltaPill value={kpis.arrYoY} label={`${pct(kpis.arrYoY, 0, { sign: true })} YoY`} />}
          sub={
            <>
              MRR {eur(kpis.mrr)} · {num(kpis.activeCustomers.selfServe)} self-serve,{" "}
              {num(kpis.activeCustomers.enterprise)} enterprise
            </>
          }
        />
        <KpiCard
          label="Net revenue retention"
          value={pct(kpis.nrr12m)}
          delta={<DeltaPill value={kpis.nrr12m - 1} label={kpis.nrr12m >= 1 ? "Net expansion" : "Net contraction"} />}
          sub={<>Gross retention {pct(kpis.grr12m)} · trailing 12 months</>}
        />
        <KpiCard
          label="FY2026 revenue · P50"
          highlight
          value={eur(fy26.p50)}
          delta={<DeltaPill value={vsPlan} label={`${pct(vsPlan, 1, { sign: true })} vs plan`} />}
          sub={
            <>
              P10–P90 {eur(fy26.p10)} – {eur(fy26.p90)}
            </>
          }
          footer={<BandMeter actual={fy26.actualYtd} p10={fy26.p10} p50={fy26.p50} p90={fy26.p90} plan={fy26.plan} />}
        />
        <KpiCard
          label="FY2027 revenue · P50"
          value={eur(kpis.fy2027.p50)}
          delta={<DeltaPill value={fy27Growth} label={`${pct(fy27Growth, 0, { sign: true })} vs FY26`} />}
          sub={
            <>
              P10–P90 {eur(kpis.fy2027.p10)} – {eur(kpis.fy2027.p90)}
              <br />
              ARR Dec 2027 P50 {eur(kpis.arrDec2027.p50)}
            </>
          }
        />
        <KpiCard
          label="Cash in, next 90 days"
          value={eur(kpis.cashNext90d.p50)}
          sub={
            <>
              P10–P90 {eur(kpis.cashNext90d.p10)} – {eur(kpis.cashNext90d.p90)}
              <br />
              <span className={kpis.overdueReceivables > 0 ? "text-error" : undefined}>
                {eur(kpis.overdueReceivables)} overdue receivables
              </span>
            </>
          }
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Monthly revenue: actuals and forecast"
            subtitle={`Cash revenue by month. Forecast from ${monthLabel(monthly.find((m) => m.revenue)?.month)} with P10–P90 range.`}
            right={
              <Legend
                items={[
                  { label: "Actual", color: C.blue },
                  { label: "Forecast P50", color: C.blue, kind: "line" },
                  { label: "P10–P90", color: C.blue, kind: "band" },
                ]}
              />
            }
          />
          {hasForecast || monthly.length ? (
            <RevenueFanChart monthly={monthly} asOfMonth={aom} />
          ) : (
            <Empty>No monthly data in this snapshot.</Empty>
          )}
          <TableView
            columns={["Month", "Actual", "P10", "P50", "P90"]}
            rows={monthly.map((m) => [
              monthLabel(m.month),
              eur(m.actualRevenue),
              eur(m.revenue?.p10),
              eur(m.revenue?.p50),
              eur(m.revenue?.p90),
            ])}
          />
        </Card>
        <BriefCard initial={pipelineBrief()} asOf={dateLabel(meta.asOf)} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader
            title="ARR: actual by segment, forecast range"
            subtitle={`Dec 2026 P50 ${eur(kpis.arrDec2026.p50)} · Dec 2027 P50 ${eur(kpis.arrDec2027.p50)} (P10–P90 ${eur(kpis.arrDec2027.p10)} – ${eur(kpis.arrDec2027.p90)})`}
          />
          <Legend
            className="mb-3"
            items={[
              { label: "Self-serve", color: C.blue },
              { label: "Enterprise", color: C.orange },
              { label: "Forecast P50", color: C.ink, kind: "line" },
              { label: "P10–P90", color: C.blue, kind: "band" },
            ]}
          />
          <ArrChart monthly={monthly} asOfMonth={aom} />
          <TableView
            columns={["Month", "Self-serve", "Enterprise", "ARR / P50", "P10", "P90"]}
            rows={monthly.map((m) => [
              monthLabel(m.month),
              eur(m.actualArrBySegment?.selfServe),
              eur(m.actualArrBySegment?.enterprise),
              eur(m.actualArr ?? m.arr?.p50),
              eur(m.arr?.p10),
              eur(m.arr?.p90),
            ])}
          />
        </Card>
        <Card>
          <CardHeader title="ARR bridge" subtitle={`${bridge.period} · expected values`} />
          <Legend
            className="mb-3"
            items={[
              { label: "ARR level", color: BRIDGE_COLORS.total },
              { label: "Increase", color: BRIDGE_COLORS.increase },
              { label: "Decrease", color: BRIDGE_COLORS.decrease },
            ]}
          />
          {bridge.steps.length ? <BridgeChart steps={bridge.steps} /> : <Empty>No bridge in this snapshot.</Empty>}
          <TableView
            columns={["Step", "Value", "Note"]}
            rows={bridge.steps.map((s) => [s.name, eur(s.kind === "decrease" ? -Math.abs(s.value) : s.value), s.note])}
          />
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader
          title="What the forecast is made of"
          subtitle="Expected revenue per forecast month, split by source. Open pipeline = current HubSpot deals at model win probability; future pipeline = deals not created yet."
        />
        <Legend className="mb-3" items={COMPONENTS.map((c) => ({ label: c.label, color: c.color }))} />
        {hasComponents ? <ComponentsChart monthly={monthly} /> : <Empty>No forecast components in this snapshot.</Empty>}
        <TableView
          columns={["Month", ...COMPONENTS.map((c) => c.label)]}
          rows={monthly
            .filter((m) => m.components)
            .map((m) => [monthLabel(m.month), ...COMPONENTS.map((c) => eur(m.components![c.key]))])}
        />
      </Card>
    </>
  );
}
