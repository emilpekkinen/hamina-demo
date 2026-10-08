"use client";

import { Bar, CartesianGrid, ComposedChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ForecastData } from "@/lib/types";
import { useNarrow } from "@/lib/useNarrow";
import { C, axisProps, yAxisProps } from "@/lib/chart";
import { dateLabel, eur, eurTick } from "@/lib/format";
import { CASH_SERIES } from "@/lib/series";
import { TipBox, rowOf } from "./Tip";

type Week = ForecastData["cash"]["weekly"][number];
type Row = {
  weekStart: string;
  openInvoices: number;
  renewals: number;
  newBusiness: number;
  p10: number;
  p50: number;
  p90: number;
};

function niceMax(v: number) {
  const mag = 10 ** Math.floor(Math.log10(v));
  const step = mag / 2;
  return Math.ceil((v * 1.04) / step) * step;
}

type WhiskerProps = { x?: number; y?: number; width?: number; height?: number; payload?: Row };

/** P10–P90 whisker drawn from the overlay bar's geometry (axis starts at 0, so px per € = height / p50). */
function Whisker({ x = 0, y = 0, width = 0, height = 0, payload }: WhiskerProps) {
  if (!payload || !payload.p50 || height <= 0) return null;
  const k = height / payload.p50;
  const base = y + height;
  const top = base - payload.p90 * k;
  const bottom = base - payload.p10 * k;
  const cx = x + width / 2;
  const cap = Math.min(10, width / 2);
  return (
    <g stroke={C.ink} strokeWidth={1.5} strokeLinecap="round">
      <line x1={cx} x2={cx} y1={top} y2={bottom} />
      <line x1={cx - cap / 2} x2={cx + cap / 2} y1={top} y2={top} />
      <line x1={cx - cap / 2} x2={cx + cap / 2} y1={bottom} y2={bottom} />
    </g>
  );
}

export function CashWeeklyChart({ weekly, height = 300 }: { weekly: Week[]; height?: number }) {
  const narrow = useNarrow();
  const rows: Row[] = weekly.map((w) => ({
    weekStart: w.weekStart,
    openInvoices: w.components.openInvoices,
    renewals: w.components.renewals,
    newBusiness: w.components.newBusiness,
    p10: w.expected.p10,
    p50: w.expected.p50,
    p90: w.expected.p90,
  }));
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 12, right: 8, bottom: 0, left: 0 }} barCategoryGap="30%">
          <CartesianGrid vertical={false} stroke={C.grid} />
          <XAxis dataKey="weekStart" {...axisProps} tickFormatter={(d: string) => dateLabel(d, true)} interval={narrow ? 2 : 0} minTickGap={4} />
          <XAxis dataKey="weekStart" xAxisId="overlay" hide />
          <YAxis {...yAxisProps} tickFormatter={eurTick} domain={[0, niceMax(Math.max(1, ...rows.map((r) => r.p90)))]} />
          <Tooltip
            cursor={{ fill: C.grid, opacity: 0.6 }}
            content={({ active, payload }) => {
              const r = rowOf<Row>(payload);
              if (!active || !r) return null;
              return (
                <TipBox
                  title={`Week of ${dateLabel(r.weekStart)}`}
                  rows={[
                    { label: "expected (P50)", value: eur(r.p50), kind: "none" },
                    { label: "P10–P90", value: `${eur(r.p10)} – ${eur(r.p90)}`, color: C.ink, kind: "line" },
                    ...[...CASH_SERIES].reverse().map((s) => ({
                      label: s.label,
                      value: eur(r[s.key]),
                      color: s.color,
                      kind: "rect" as const,
                    })),
                  ]}
                />
              );
            }}
          />
          {CASH_SERIES.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              stackId="cash"
              fill={s.color}
              stroke="#fff"
              strokeWidth={1}
              maxBarSize={36}
              radius={i === CASH_SERIES.length - 1 ? [4, 4, 0, 0] : 0}
              isAnimationActive={false}
            />
          ))}
          {/* P10–P90 whiskers drawn on an invisible overlay bar of the P50 total */}
          <Bar
            dataKey="p50"
            xAxisId="overlay"
            maxBarSize={36}
            isAnimationActive={false}
            legendType="none"
            shape={(props: unknown) => <Whisker {...(props as WhiskerProps)} />}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
