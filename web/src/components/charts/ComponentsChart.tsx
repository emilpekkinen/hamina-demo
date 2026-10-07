"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ForecastData } from "@/lib/types";
import { C, axisProps, yAxisProps } from "@/lib/chart";
import { eur, eurTick, monthLabel } from "@/lib/format";
import { TipBox, rowOf } from "./Tip";

type Comp = NonNullable<ForecastData["monthly"][number]["components"]>;

export const COMPONENTS: { key: keyof Comp; label: string; color: string }[] = [
  { key: "existingSelfServe", label: "Existing self-serve", color: C.blue },
  { key: "newSelfServe", label: "New self-serve", color: C.teal },
  { key: "existingEnterprise", label: "Existing enterprise", color: C.orange },
  { key: "pipelineEnterprise", label: "Open pipeline", color: C.violet },
  { key: "futurePipeline", label: "Future pipeline", color: C.pink },
];

type Row = Comp & { month: string; total: number };

export function ComponentsChart({ monthly, height = 260 }: { monthly: ForecastData["monthly"]; height?: number }) {
  const rows: Row[] = monthly
    .filter((m) => m.components)
    .map((m) => {
      const c = m.components!;
      return { month: m.month, ...c, total: COMPONENTS.reduce((s, k) => s + (c[k.key] ?? 0), 0) };
    });
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="24%">
          <CartesianGrid vertical={false} stroke={C.grid} />
          <XAxis dataKey="month" {...axisProps} tickFormatter={(m: string) => monthLabel(m, true)} minTickGap={8} />
          <YAxis {...yAxisProps} tickFormatter={eurTick} />
          <Tooltip
            cursor={{ fill: C.grid, opacity: 0.6 }}
            content={({ active, payload }) => {
              const r = rowOf<Row>(payload);
              if (!active || !r) return null;
              return (
                <TipBox
                  title={`${monthLabel(r.month)} · expected ${eur(r.total)}`}
                  rows={[...COMPONENTS]
                    .reverse()
                    .map((k) => ({ label: k.label, value: eur(r[k.key]), color: k.color, kind: "rect" as const }))}
                />
              );
            }}
          />
          {COMPONENTS.map((k, i) => (
            <Bar
              key={k.key}
              dataKey={k.key}
              stackId="c"
              fill={k.color}
              stroke="#fff"
              strokeWidth={1}
              maxBarSize={24}
              radius={i === COMPONENTS.length - 1 ? [4, 4, 0, 0] : 0}
              isAnimationActive={false}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
