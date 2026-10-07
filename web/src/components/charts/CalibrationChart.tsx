"use client";

import {
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { C, axisProps, yAxisProps } from "@/lib/chart";
import { asRatio, num, pct } from "@/lib/format";
import { TipBox, rowOf } from "./Tip";

type Point = { bucket: string; predicted: number; actual: number; n: number };

export function CalibrationChart({ points, height = 240 }: { points: Point[]; height?: number }) {
  const rows = points.map((p) => ({ ...p, predicted: asRatio(p.predicted), actual: asRatio(p.actual) }));
  const lo = Math.max(0, Math.floor(Math.min(...rows.flatMap((r) => [r.predicted, r.actual]), 1) * 10) / 10 - 0.1);
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 8, right: 16, bottom: 16, left: 0 }}>
          <CartesianGrid stroke={C.grid} />
          <XAxis
            type="number"
            dataKey="predicted"
            domain={[lo, 1]}
            {...axisProps}
            tickFormatter={(v: number) => pct(v)}
            label={{ value: "Predicted renewal rate", position: "insideBottom", offset: -10, fill: C.axis, fontSize: 11 }}
          />
          <YAxis
            type="number"
            dataKey="actual"
            domain={[lo, 1]}
            {...yAxisProps}
            width={44}
            tickFormatter={(v: number) => pct(v)}
          />
          <ZAxis type="number" dataKey="n" range={[50, 260]} />
          <ReferenceLine
            segment={[
              { x: lo, y: lo },
              { x: 1, y: 1 },
            ]}
            stroke="#BDBEC1"
            strokeWidth={1.5}
            strokeDasharray="4 4"
            ifOverflow="hidden"
          />
          <Tooltip
            cursor={false}
            content={({ active, payload }) => {
              const r = rowOf<Point>(payload);
              if (!active || !r) return null;
              return (
                <TipBox
                  title={`Bucket ${r.bucket}`}
                  rows={[
                    { label: "predicted", value: pct(r.predicted, 1), kind: "none" },
                    { label: "actual", value: pct(r.actual, 1), color: C.blue, kind: "rect" },
                    { label: "renewals", value: num(r.n), kind: "none" },
                  ]}
                />
              );
            }}
          />
          <Scatter data={rows} fill={C.blue} fillOpacity={0.85} stroke="#fff" strokeWidth={2} isAnimationActive={false} />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
