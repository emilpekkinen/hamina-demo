import type { Metadata } from "next";
import { CohortHeatmap } from "@/components/CohortHeatmap";
import { DriverBars } from "@/components/DriverBars";
import { RenewalsTable } from "@/components/RenewalsTable";
import { CalibrationChart } from "@/components/charts/CalibrationChart";
import { MrrMovementsChart } from "@/components/charts/MrrMovementsChart";
import { Card, CardHeader, Empty, Legend, PageHeader, Stat, TableView } from "@/components/ui";
import { C } from "@/lib/chart";
import { data } from "@/lib/data";
import { eur, monthLabel, num, pct } from "@/lib/format";
import { MRR_SERIES } from "@/lib/series";

export const metadata: Metadata = { title: "Retention · Hamina RevOps (demo)" };

export default function RetentionPage() {
  const { mrrMovements, cohorts, renewalModel: rm, renewals, kpis, meta } = data;
  const liftX = rm.lift.avgChurn ? rm.lift.topDecileChurn / rm.lift.avgChurn : 0;
  const recent = mrrMovements.slice(-12);
  const sum = (k: (typeof MRR_SERIES)[number]["key"]) => recent.reduce((s, r) => s + Math.abs(Number(r[k]) || 0), 0);

  return (
    <>
      <PageHeader
        eyebrow="Retention"
        title="Keep the revenue you"
        accent="already have"
        lead={
          <>
            Net revenue retention {pct(kpis.nrr12m)}, gross {pct(kpis.grr12m)} over the trailing 12 months. A renewal
            model scores every upcoming renewal so success and sales can act before the renewal date.
          </>
        }
      />

      <Card>
        <CardHeader
          title="MRR movements"
          subtitle={`Monthly MRR added and lost. Last 12 months: ${eur(sum("new"))} new, ${eur(sum("expansion"))} expansion, ${eur(-sum("contraction"))} contraction, ${eur(-sum("churn"))} churn.`}
        />
        <Legend
          className="mb-3"
          items={[
            ...MRR_SERIES.map((s) => ({ label: s.label, color: s.color })),
            { label: "Net new MRR", color: C.ink, kind: "line" as const },
          ]}
        />
        {mrrMovements.length ? <MrrMovementsChart movements={mrrMovements} /> : <Empty>No MRR movements in this snapshot.</Empty>}
        <TableView
          columns={["Month", ...MRR_SERIES.map((s) => s.label)]}
          rows={mrrMovements.map((m) => [monthLabel(m.month), ...MRR_SERIES.map((s) => eur(s.sign * Math.abs(Number(m[s.key]) || 0)))])}
        />
      </Card>

      <Card className="mt-4">
        <CardHeader
          title="Renewal model"
          subtitle={`Scores every renewal from billing, seat and CRM signals. Trained on ${num(rm.trainingRows)} historical renewals, tested on ${rm.testPeriod}.`}
        />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1.35fr_1.15fr]">
          <div>
            <div className="grid grid-cols-3 gap-3 rounded-lg bg-gray-50 p-4 lg:grid-cols-1 xl:grid-cols-3">
              <Stat label="AUC (test)" value={rm.aucTest.toFixed(2)} sub="0.5 = coin flip" />
              <Stat label="Base rate" value={pct(rm.baseRate)} sub="historical renewal" />
              <Stat label="Lift" value={`${liftX.toFixed(1)}×`} sub="churn in top-risk decile" />
            </div>
            <p className="mt-4 text-[13px] leading-5 text-gray-600">
              The riskiest 10% of renewals churn at <strong>{pct(rm.lift.topDecileChurn)}</strong>, against{" "}
              {pct(rm.lift.avgChurn)} on average. That is where a CSM call is worth the most.
            </p>
          </div>
          <div>
            <h3 className="mb-2 text-[13px] font-semibold text-gray-900">What drives renewal</h3>
            <DriverBars drivers={rm.drivers} outcome="renewal" />
          </div>
          <div>
            <h3 className="text-[13px] font-semibold text-gray-900">Calibration: predicted vs actual</h3>
            <p className="mb-2 text-xs text-gray-500">On the dashed diagonal = probabilities can be taken at face value. Size = renewals.</p>
            {rm.calibration.length ? <CalibrationChart points={rm.calibration} height={220} /> : <Empty>No calibration data.</Empty>}
            <TableView
              columns={["Bucket", "Predicted", "Actual", "n"]}
              rows={rm.calibration.map((c) => [c.bucket, pct(c.predicted, 1), pct(c.actual, 1), num(c.n)])}
            />
          </div>
        </div>
      </Card>

      <Card className="mt-4">
        <CardHeader
          title="Upcoming renewals at risk"
          subtitle="Next 180 days, both segments. Default sort: expected ARR at risk = ARR × (1 − P(renew))."
        />
        <RenewalsTable renewals={renewals} asOf={meta.asOf} />
      </Card>

      <Card className="mt-4">
        <CardHeader
          title="Self-serve cohort retention"
          subtitle="Share of each quarterly cohort’s starting MRR still active N quarters later (net of expansion)."
        />
        <CohortHeatmap cohorts={cohorts} />
      </Card>
    </>
  );
}
