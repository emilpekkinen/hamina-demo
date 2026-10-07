import type { Metadata } from "next";
import { DealsTable } from "@/components/DealsTable";
import { DriverBars } from "@/components/DriverBars";
import { StageCalibrationChart } from "@/components/charts/StageCalibrationChart";
import { Card, CardHeader, DeltaPill, Empty, KpiCard, Legend, PageHeader, TableView } from "@/components/ui";
import { C } from "@/lib/chart";
import { data } from "@/lib/data";
import { eur, num, pct } from "@/lib/format";

export const metadata: Metadata = { title: "Pipeline · Hamina RevOps (demo)" };

export default function PipelinePage() {
  const { deals, dealModel: dm, kpis } = data;
  const op = kpis.openPipeline;
  const gap = op.hubspotWeighted ? op.modelExpected / op.hubspotWeighted - 1 : 0;
  const linked = deals.filter((d) => d.stripeLinked);
  const brierGain = dm.brierHubspot ? 1 - dm.brierModel / dm.brierHubspot : 0;
  const brierMax = Math.max(dm.brierModel, dm.brierHubspot, 0.25);

  return (
    <>
      <PageHeader
        eyebrow="Pipeline"
        title="What the pipeline is"
        accent="really worth"
        lead="HubSpot stage probabilities are a guess. A deal model trained on historical HubSpot snapshots estimates win probability and close date per deal, and flags self-serve customers already paying via Stripe."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Open pipeline" value={eur(op.amount)} sub={`${num(op.count)} open deals in HubSpot`} />
        <KpiCard
          label="HubSpot-weighted"
          value={eur(op.hubspotWeighted)}
          sub="Amount × stage probability, as reported in the CRM"
        />
        <KpiCard
          label="Model-expected"
          highlight
          value={eur(op.modelExpected)}
          delta={<DeltaPill value={gap} label={`${pct(gap, 0, { sign: true })} vs HubSpot`} />}
          sub="Amount × modelled win probability. This is what the forecast uses."
        />
        <KpiCard
          label="Close-date slip"
          value={`${num(dm.slipDaysMedian)} days`}
          sub={`Median delay of won deals vs the rep's close date. ${linked.length} open deals are already paying self-serve.`}
        />
      </div>

      <Card className="mt-4">
        <CardHeader
          title="Open deals"
          subtitle="Default sort: model-expected value. Δ pp = model win probability minus HubSpot stage probability."
        />
        <DealsTable deals={deals} />
      </Card>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader
            title="Stage calibration"
            subtitle="HubSpot stage probability vs the share of deals at that stage that were actually won."
          />
          <Legend
            className="mb-2"
            items={[
              { label: "HubSpot stage probability", color: C.neutral },
              { label: "Actual win rate", color: C.blue },
            ]}
          />
          {dm.stageCalibration.length ? (
            <StageCalibrationChart rows={dm.stageCalibration} />
          ) : (
            <Empty>No stage calibration data.</Empty>
          )}
          <TableView
            columns={["Stage", "HubSpot", "Actual", "n"]}
            rows={dm.stageCalibration.map((s) => [s.stage, pct(s.hubspotProb), pct(s.empiricalProb), num(s.n)])}
          />
        </Card>

        <Card>
          <CardHeader
            title="What drives a win"
            subtitle={`Trained on ${num(dm.trainingSnapshots)} snapshots of ${num(dm.deals)} closed deals.`}
          />
          <DriverBars drivers={dm.drivers} outcome="win" />
        </Card>

        <Card>
          <CardHeader
            title="Accuracy: Brier score"
            subtitle="Mean squared error of the win probability on closed deals. Lower is better."
          />
          <div className="space-y-4">
            {[
              { label: "Deal model", value: dm.brierModel, color: C.blue },
              { label: "HubSpot stage probability", value: dm.brierHubspot, color: C.neutral },
            ].map((b) => (
              <div key={b.label}>
                <div className="mb-1.5 flex items-baseline justify-between text-[13px]">
                  <span className="text-gray-700">{b.label}</span>
                  <span className="font-semibold tabular text-gray-900">{b.value.toFixed(3)}</span>
                </div>
                <div className="h-3 rounded-full bg-gray-100">
                  <div
                    className="h-3 rounded-full"
                    style={{ width: `${(b.value / brierMax) * 100}%`, background: b.color }}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3 rounded-lg bg-gray-50 p-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Error reduction</p>
              <p className="mt-1 text-xl font-bold tracking-tight text-gray-900">{pct(brierGain)}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Model AUC</p>
              <p className="mt-1 text-xl font-bold tracking-tight text-gray-900">{dm.aucModel.toFixed(2)}</p>
            </div>
          </div>
        </Card>
      </div>
    </>
  );
}
