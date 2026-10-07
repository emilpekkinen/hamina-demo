"use client";

import { Bar, BarChart, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Marketing } from "@/lib/types";
import { CHANNEL_SERIES, LAG_SERIES } from "@/lib/marketingSeries";
import { C, axisProps, yAxisProps } from "@/lib/chart";
import { eur, eurTick, monthLabel } from "@/lib/format";
import { TipBox, rowOf } from "./Tip";

type M = Marketing["monthly"][number];

/** Monthly paid spend by channel (bars, left axis) vs self-serve new bookings (line, right axis). */
export function SpendVsBookingsChart({ monthly, height = 320 }: { monthly: M[]; height?: number }) {
  const rows = monthly.filter((m) => m.month >= "2023-01").map((m) => ({ ...m, label: monthLabel(m.month, true) }));
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} barCategoryGap="18%">
          <CartesianGrid vertical={false} stroke={C.grid} />
          <XAxis dataKey="label" {...axisProps} interval={5} />
          <YAxis yAxisId="spend" {...yAxisProps} tickFormatter={eurTick} />
          <YAxis yAxisId="rev" orientation="right" {...yAxisProps} tickFormatter={eurTick} />
          <Tooltip
            cursor={{ fill: C.grid, opacity: 0.6 }}
            content={({ active, payload }) => {
              const r = rowOf<M & { label: string }>(payload);
              if (!active || !r) return null;
              const spend = CHANNEL_SERIES.reduce((s, c) => s + (r[c.key] ?? 0), 0);
              return (
                <TipBox
                  title={monthLabel(r.month)}
                  rows={[
                    { label: "Self-serve new bookings", value: eur(r.newSelfServe), color: C.ink, kind: "line" },
                    ...(r.modelSelfServe != null ? [{ label: "Model fit", value: eur(r.modelSelfServe), color: C.axis, kind: "line" as const }] : []),
                    { label: "Paid spend", value: eur(spend), kind: "none" as const },
                    ...CHANNEL_SERIES.filter((c) => r[c.key] > 0).map((c) => ({ label: c.label, value: eur(r[c.key]), color: c.color, kind: "rect" as const, muted: true })),
                  ]}
                />
              );
            }}
          />
          {CHANNEL_SERIES.map((c) => (
            <Bar key={c.key} yAxisId="spend" dataKey={c.key} stackId="s" fill={c.color} isAnimationActive={false} />
          ))}
          <Line yAxisId="rev" dataKey="newSelfServe" stroke={C.ink} strokeWidth={2} dot={false} isAnimationActive={false} />
          <Line yAxisId="rev" dataKey="modelSelfServe" stroke={C.axis} strokeWidth={1.5} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Correlation of detrended spend with detrended outcomes k months later. */
export function LagChart({ lag, height = 280 }: { lag: Marketing["lag"]; height?: number }) {
  const rows = lag.rows.map((r) => ({ ...r, label: r.lag === 0 ? "Same month" : `+${r.lag} mo` }));
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} barCategoryGap="22%">
          <CartesianGrid vertical={false} stroke={C.grid} />
          <XAxis dataKey="label" {...axisProps} />
          <YAxis {...yAxisProps} domain={[-0.6, 0.6]} ticks={[-0.6, -0.3, 0, 0.3, 0.6]} tickFormatter={(v: number) => v.toFixed(1)} />
          <ReferenceLine y={0} stroke="#DCDDDF" />
          <Tooltip
            cursor={{ fill: C.grid, opacity: 0.6 }}
            content={({ active, payload }) => {
              const r = rowOf<(typeof rows)[number]>(payload);
              if (!active || !r) return null;
              return (
                <TipBox
                  title={r.lag === 0 ? "Spend and outcome in the same month" : `Outcome ${r.lag} month${r.lag > 1 ? "s" : ""} after spend`}
                  rows={LAG_SERIES.map((s) => ({ label: lag.labels[s.key], value: r[s.key] == null ? "–" : r[s.key]!.toFixed(2), color: s.color, kind: "rect" as const }))}
                />
              );
            }}
          />
          {LAG_SERIES.map((s) => (
            <Bar key={s.key} dataKey={s.key} fill={s.color} radius={[2, 2, 0, 0]} isAnimationActive={false} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

