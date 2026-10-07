"use client";

import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ForecastData } from "@/lib/types";
import { C, axisProps, yAxisProps } from "@/lib/chart";
import { eur, eurTick } from "@/lib/format";
import { TipBox, rowOf } from "./Tip";

type Step = ForecastData["bridge"]["steps"][number];
type Row = Step & { base: number; size: number; label: string; color: string; running: number };

export const BRIDGE_COLORS = { total: C.inkSoft, increase: C.blue, decrease: C.pink };

export function BridgeChart({ steps, height = 280 }: { steps: Step[]; height?: number }) {
  let running = 0;
  const rows: Row[] = steps.map((s) => {
    if (s.kind === "start" || s.kind === "end") {
      running = s.value;
      return { ...s, base: 0, size: s.value, label: eur(s.value), color: BRIDGE_COLORS.total, running };
    }
    const v = s.kind === "decrease" ? -Math.abs(s.value) : Math.abs(s.value);
    const base = v >= 0 ? running : running + v;
    running += v;
    return {
      ...s,
      base,
      size: Math.abs(v),
      label: eur(v, { sign: true }),
      color: v >= 0 ? BRIDGE_COLORS.increase : BRIDGE_COLORS.decrease,
      running,
    };
  });
  const max = Math.max(...rows.map((r) => r.base + r.size), 1);
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 22, right: 8, bottom: 0, left: 0 }} barCategoryGap="28%">
          <CartesianGrid vertical={false} stroke={C.grid} />
          <XAxis
            dataKey="name"
            {...axisProps}
            interval={0}
            height={40}
            tick={({ x, y, payload }) => {
              const words = String(payload.value).split(" ");
              const mid = Math.ceil(words.length / 2);
              const lines = words.length > 2 ? [words.slice(0, mid).join(" "), words.slice(mid).join(" ")] : [words.join(" ")];
              return (
                <text x={x} y={y + 12} textAnchor="middle" fill={C.axis} fontSize={11}>
                  {lines.map((l, i) => (
                    <tspan key={i} x={x} dy={i === 0 ? 0 : 13}>
                      {l}
                    </tspan>
                  ))}
                </text>
              );
            }}
          />
          <YAxis {...yAxisProps} tickFormatter={eurTick} domain={[0, Math.ceil((max * 1.08) / 500000) * 500000]} />
          <Tooltip
            cursor={{ fill: C.grid, opacity: 0.6 }}
            content={({ active, payload }) => {
              const r = rowOf<Row>(payload);
              if (!active || !r) return null;
              return (
                <TipBox
                  title={r.name}
                  rows={[
                    { label: r.kind === "start" || r.kind === "end" ? "ARR" : "change", value: r.label, color: r.color, kind: "rect" },
                    ...(r.kind === "increase" || r.kind === "decrease"
                      ? [{ label: "running ARR", value: eur(r.running), kind: "none" as const }]
                      : []),
                  ]}
                  footer={r.note || undefined}
                />
              );
            }}
          />
          <Bar dataKey="base" stackId="w" fill="transparent" isAnimationActive={false} />
          <Bar dataKey="size" stackId="w" radius={[4, 4, 4, 4]} maxBarSize={44} isAnimationActive={false}>
            {rows.map((r) => (
              <Cell key={r.name} fill={r.color} />
            ))}
            <LabelList dataKey="label" position="top" fill={C.ink} fontSize={11} fontWeight={600} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
