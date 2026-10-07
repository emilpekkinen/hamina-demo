"use client";

import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ForecastData } from "@/lib/types";
import { C, axisProps, yAxisProps } from "@/lib/chart";
import { dateLabel, eur, eurTick, pct } from "@/lib/format";
import { TipBox, rowOf } from "./Tip";

type BT = ForecastData["backtest"][number];
type Row = BT & { label: string; range: [number, number]; p50: number };

function Diamond(props: { cx?: number; cy?: number }) {
  const { cx, cy } = props;
  if (cx == null || cy == null) return null;
  const s = 6;
  return (
    <path
      d={`M${cx},${cy - s} L${cx + s},${cy} L${cx},${cy + s} L${cx - s},${cy} Z`}
      fill={C.ink}
      stroke="#fff"
      strokeWidth={2}
    />
  );
}

function Tick(props: { cx?: number; cy?: number }) {
  const { cx, cy } = props;
  if (cx == null || cy == null) return null;
  return <rect x={cx - 11} y={cy - 1.5} width={22} height={3} rx={1.5} fill={C.blue} stroke="#fff" strokeWidth={1} />;
}

function Ring(props: { cx?: number; cy?: number }) {
  const { cx, cy } = props;
  if (cx == null || cy == null) return null;
  return <circle cx={cx} cy={cy} r={4.5} fill="#fff" stroke={C.orange} strokeWidth={2} />;
}

export function BacktestChart({ backtest, height = 300 }: { backtest: BT[]; height?: number }) {
  const rows: Row[] = backtest.map((b) => ({
    ...b,
    label: dateLabel(b.asOf),
    range: [b.forecast.p10, b.forecast.p90],
    p50: b.forecast.p50,
  }));
  const vals = rows.flatMap((r) => [r.forecast.p10, r.forecast.p90, r.actual, r.naiveRunRate]);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const pad = (hi - lo) * 0.12 || hi * 0.1;
  const step = 10 ** Math.floor(Math.log10(Math.max(hi - lo, 1))) / 2;
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 12, right: 8, bottom: 0, left: 0 }} barCategoryGap="40%">
          <CartesianGrid vertical={false} stroke={C.grid} />
          <XAxis dataKey="label" {...axisProps} />
          <YAxis {...yAxisProps} tickFormatter={eurTick} domain={[Math.max(0, Math.floor((lo - pad) / step) * step), Math.ceil((hi + pad) / step) * step]} />
          <Tooltip
            cursor={{ fill: C.grid, opacity: 0.6 }}
            content={({ active, payload }) => {
              const r = rowOf<Row>(payload);
              if (!active || !r) return null;
              return (
                <TipBox
                  title={`Forecast made ${dateLabel(r.asOf)} · next ${r.horizonMonths} months`}
                  rows={[
                    { label: "actual", value: eur(r.actual), color: C.ink, kind: "rect" },
                    { label: `P50 (${pct(r.errorPct, 1, { sign: true })})`, value: eur(r.p50), color: C.blue, kind: "line" },
                    { label: "P10–P90", value: `${eur(r.forecast.p10)} – ${eur(r.forecast.p90)}`, color: C.blue, kind: "band" },
                    { label: `naive run-rate (${pct(r.naiveErrorPct, 1, { sign: true })})`, value: eur(r.naiveRunRate), color: C.orange, kind: "line" },
                  ]}
                  footer={r.inBand ? "Actual landed inside the P10–P90 band" : "Actual landed outside the band"}
                />
              );
            }}
          />
          <Bar dataKey="range" fill={C.blue} fillOpacity={0.16} radius={4} maxBarSize={56} isAnimationActive={false} />
          <Line dataKey="p50" stroke="none" dot={<Tick />} activeDot={false} isAnimationActive={false} />
          <Line dataKey="naiveRunRate" stroke="none" dot={<Ring />} activeDot={false} isAnimationActive={false} />
          <Line dataKey="actual" stroke="none" dot={<Diamond />} activeDot={false} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
