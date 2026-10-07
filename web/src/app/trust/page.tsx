import type { Metadata } from "next";
import { Check, X } from "lucide-react";
import { BacktestChart } from "@/components/charts/BacktestChart";
import { Card, CardHeader, Empty, KpiCard, LegendKey, PageHeader, Pill, TableWrap, cx, td, tdNum, th } from "@/components/ui";
import { C } from "@/lib/chart";
import { data } from "@/lib/data";
import { dateLabel, eur, num, pct } from "@/lib/format";

export const metadata: Metadata = { title: "Model trust · Hamina RevOps (demo)" };

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export default function TrustPage() {
  const { backtest, meta, renewalModel: rm, dealModel: dm } = data;
  const mape = mean(backtest.map((b) => Math.abs(b.errorPct)));
  const naiveMape = mean(backtest.map((b) => Math.abs(b.naiveErrorPct)));
  const inBand = backtest.filter((b) => b.inBand).length;

  return (
    <>
      <PageHeader
        eyebrow="Model trust"
        title="Would this forecast have been"
        accent="right?"
        lead="Every number here comes from out-of-time backtests: the model is re-run as if it were an earlier date, using only the data available then, and compared with what actually happened."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Avg. absolute error · P50"
          highlight
          value={pct(mape, 1)}
          sub={`Across ${num(backtest.length)} backtests`}
        />
        <KpiCard label="Naive run-rate error" value={pct(naiveMape, 1)} sub="Last 3 months extrapolated, same periods" />
        <KpiCard
          label="Actual inside P10–P90"
          value={`${num(inBand)} of ${num(backtest.length)}`}
          sub="An 80% band should catch about 4 in 5"
        />
        <KpiCard
          label="Component models"
          value={`AUC ${rm.aucTest.toFixed(2)} · ${dm.aucModel.toFixed(2)}`}
          sub="Renewal model · deal model (test sets)"
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardHeader
            title="Backtests: forecast range vs what happened"
            subtitle="Cash revenue over the forecast horizon, for each historical as-of date."
          />
          <ul className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-gray-600">
            <li className="flex items-center gap-1.5"><LegendKey color={C.blue} kind="band" />P10–P90</li>
            <li className="flex items-center gap-1.5"><span className="inline-block h-[3px] w-3.5 rounded-full" style={{ background: C.blue }} />Forecast P50</li>
            <li className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rotate-45 bg-gray-900" />Actual</li>
            <li className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full border-2" style={{ borderColor: C.orange }} />Naive run-rate</li>
          </ul>
          {backtest.length ? <BacktestChart backtest={backtest} /> : <Empty>No backtests in this snapshot.</Empty>}
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader title="How the forecast works" />
          <ol className="space-y-4 text-[13px] leading-5 text-gray-600">
            {[
              [
                "Unify the data",
                "Stripe subscriptions and invoices are joined to HubSpot companies and deals (domain, contact email, fuzzy name), so each customer is counted once.",
              ],
              [
                "Model each piece",
                "A renewal model scores every renewal, a deal model estimates win probability and close date for each open deal, and new self-serve signups and future pipeline follow historical rates.",
              ],
              [
                "Simulate",
                `${num(meta.simulations)} Monte Carlo runs draw renewals, wins, close dates and payment timing together. The spread of outcomes gives the P10, P50 and P90.`,
              ],
              [
                "Test out of time",
                "Each backtest uses only the data available at its as-of date. A forecast that only fits the past it was trained on would fail here.",
              ],
            ].map(([t, body], i) => (
              <li key={t} className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-900">
                  {i + 1}
                </span>
                <div>
                  <p className="font-semibold text-gray-900">{t}</p>
                  <p className="mt-0.5">{body}</p>
                </div>
              </li>
            ))}
          </ol>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader title="Backtest detail" subtitle="Error = (forecast − actual) ÷ actual. Negative means the forecast was too low." />
        {backtest.length === 0 ? (
          <Empty>No backtests in this snapshot.</Empty>
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <th className={th}>Forecast as of</th>
                <th className={cx(th, "text-right")}>Horizon</th>
                <th className={cx(th, "text-right")}>Actual</th>
                <th className={cx(th, "text-right")}>P50</th>
                <th className={cx(th, "text-right")}>P10 – P90</th>
                <th className={cx(th, "text-right")}>Error</th>
                <th className={cx(th, "text-right")}>Naive run-rate</th>
                <th className={cx(th, "text-right")}>Naive error</th>
                <th className={cx(th, "text-right")}>HubSpot-weighted</th>
                <th className={th}>In band</th>
              </tr>
            </thead>
            <tbody>
              {backtest.map((b) => {
                const better = Math.abs(b.errorPct) < Math.abs(b.naiveErrorPct);
                return (
                  <tr key={b.asOf} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className={cx(td, "whitespace-nowrap font-medium text-gray-900")}>{dateLabel(b.asOf)}</td>
                    <td className={tdNum}>{num(b.horizonMonths)} mo</td>
                    <td className={tdNum}>{eur(b.actual)}</td>
                    <td className={tdNum}>{eur(b.forecast.p50)}</td>
                    <td className={cx(tdNum, "font-normal text-gray-600")}>
                      {eur(b.forecast.p10)} – {eur(b.forecast.p90)}
                    </td>
                    <td className={tdNum}>
                      <span className={better ? "text-success" : undefined}>{pct(b.errorPct, 1, { sign: true })}</span>
                    </td>
                    <td className={cx(tdNum, "font-normal text-gray-600")}>{eur(b.naiveRunRate)}</td>
                    <td className={cx(tdNum, "font-normal text-gray-600")}>{pct(b.naiveErrorPct, 1, { sign: true })}</td>
                    <td className={cx(tdNum, "font-normal text-gray-600")} title="Enterprise new-logo revenue per HubSpot weighting, for reference">
                      {b.hubspotWeighted == null ? "–" : eur(b.hubspotWeighted)}
                    </td>
                    <td className={td}>
                      {b.inBand ? (
                        <Pill tone="success">
                          <Check size={12} strokeWidth={2.5} aria-hidden /> In band
                        </Pill>
                      ) : (
                        <Pill tone="error">
                          <X size={12} strokeWidth={2.5} aria-hidden /> Outside
                        </Pill>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
        )}
      </Card>
    </>
  );
}
