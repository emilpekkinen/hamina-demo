"use client";

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ForecastData } from "@/lib/types";
import { C, axisProps, yAxisProps } from "@/lib/chart";
import { eur, eurTick, monthLabel } from "@/lib/format";
import { MRR_SERIES } from "@/lib/series";
import { TipBox, rowOf } from "./Tip";

type Row = { month: string; net: number } & Record<(typeof MRR_SERIES)[number]["key"], number>;

/** Normalise sign: inflows positive, contraction/churn negative, whatever sign the pipeline used. */
export function mrrRows(m: ForecastData["mrrMovements"]): Row[] {
  return m.map((r) => {
    const row = { month: r.month } as Row;
    let net = 0;
    for (const s of MRR_SERIES) {
      const v = s.sign * Math.abs(Number(r[s.key]) || 0);
      row[s.key] = v;
      net += v;
    }
    row.net = net;
    return row;
  });
}

export function MrrMovementsChart({ movements, height = 280 }: { movements: ForecastData["mrrMovements"]; height?: number }) {
  const rows = mrrRows(movements);
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} stackOffset="sign" margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="20%">
          <CartesianGrid vertical={false} stroke={C.grid} />
          <XAxis
            dataKey="month"
            {...axisProps}
            ticks={rows.map((r) => r.month).filter((m) => m.endsWith("-01") || m.endsWith("-07"))}
            tickFormatter={(m: string) => monthLabel(m, true)}
          />
          <YAxis {...yAxisProps} tickFormatter={eurTick} />
          <ReferenceLine y={0} stroke="#BDBEC1" />
          <Tooltip
            cursor={{ fill: C.grid, opacity: 0.6 }}
            content={({ active, payload }) => {
              const r = rowOf<Row>(payload);
              if (!active || !r) return null;
              return (
                <TipBox
                  title={monthLabel(r.month)}
                  rows={[
                    ...MRR_SERIES.map((s) => ({
                      label: s.label,
                      value: eur(r[s.key], { sign: true }),
                      color: s.color,
                      kind: "rect" as const,
                    })),
                    { label: "Net new MRR", value: eur(r.net, { sign: true }), color: C.ink, kind: "line" as const },
                  ]}
                />
              );
            }}
          />
          {MRR_SERIES.map((s) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              stackId="m"
              fill={s.color}
              stroke="#fff"
              strokeWidth={1}
              maxBarSize={16}
              isAnimationActive={false}
            />
          ))}
          <Line dataKey="net" stroke={C.ink} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: "#fff", strokeWidth: 2 }} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
