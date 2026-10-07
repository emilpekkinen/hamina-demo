"use client";

import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ForecastData } from "@/lib/types";
import { C, axisProps, yAxisProps } from "@/lib/chart";
import { asRatio, num, pct } from "@/lib/format";
import { TipBox, rowOf } from "./Tip";

type Row = ForecastData["dealModel"]["stageCalibration"][number];

export function StageCalibrationChart({ rows: input, height = 240 }: { rows: Row[]; height?: number }) {
  const rows = input.map((r) => ({ ...r, hubspotProb: asRatio(r.hubspotProb), empiricalProb: asRatio(r.empiricalProb) }));
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 18, right: 8, bottom: 0, left: 0 }} barGap={2} barCategoryGap="26%">
          <CartesianGrid vertical={false} stroke={C.grid} />
          <XAxis dataKey="stage" {...axisProps} interval={0} />
          <YAxis {...yAxisProps} width={40} domain={[0, 1]} tickFormatter={(v: number) => pct(v)} />
          <Tooltip
            cursor={{ fill: C.grid, opacity: 0.6 }}
            content={({ active, payload }) => {
              const r = rowOf<Row>(payload);
              if (!active || !r) return null;
              return (
                <TipBox
                  title={r.stage}
                  rows={[
                    { label: "HubSpot stage probability", value: pct(r.hubspotProb), color: C.neutral, kind: "rect" },
                    { label: "Actual win rate", value: pct(r.empiricalProb), color: C.blue, kind: "rect" },
                  ]}
                  footer={`${num(r.n)} historical deals`}
                />
              );
            }}
          />
          <Bar dataKey="hubspotProb" fill={C.neutral} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false}>
            <LabelList dataKey="hubspotProb" position="top" formatter={(v: unknown) => pct(Number(v))} fill={C.axis} fontSize={10} />
          </Bar>
          <Bar dataKey="empiricalProb" fill={C.blue} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false}>
            <LabelList
              dataKey="empiricalProb"
              position="top"
              formatter={(v: unknown) => pct(Number(v))}
              fill={C.ink}
              fontSize={10}
              fontWeight={600}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
