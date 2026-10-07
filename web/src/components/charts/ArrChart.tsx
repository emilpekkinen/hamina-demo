"use client";

import {
  Area,
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
import { TipBox, rowOf, type TipRow } from "./Tip";
import { buildFanRows, yearTicks } from "./RevenueFanChart";

type Row = ReturnType<typeof buildFanRows>[number] & {
  selfServe: number | null;
  enterprise: number | null;
};

export function ArrChart({
  monthly,
  asOfMonth,
  height = 260,
}: {
  monthly: ForecastData["monthly"];
  asOfMonth: string;
  height?: number;
}) {
  const fan = buildFanRows(monthly, "arr");
  const rows: Row[] = fan.map((r, i) => {
    const seg = monthly[i].actualArrBySegment;
    return {
      ...r,
      selfServe: seg ? seg.selfServe : null,
      enterprise: seg ? seg.enterprise : r.actual,
    };
  });
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 16, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke={C.grid} />
          <XAxis
            dataKey="month"
            {...axisProps}
            ticks={yearTicks(rows.map((r) => r.month))}
            tickFormatter={(m: string) => monthLabel(m, true)}
          />
          <YAxis {...yAxisProps} tickFormatter={eurTick} />
          <Tooltip
            cursor={{ stroke: C.axis, strokeWidth: 1 }}
            content={({ active, payload }) => {
              const r = rowOf<Row>(payload);
              if (!active || !r) return null;
              const t: TipRow[] = [];
              if (r.actual != null) {
                t.push({ label: "ARR", value: eur(r.actual), kind: "none" });
                if (r.selfServe != null) t.push({ label: "Self-serve", value: eur(r.selfServe), color: C.blue, kind: "rect" });
                if (r.enterprise != null && r.selfServe != null)
                  t.push({ label: "Enterprise", value: eur(r.enterprise), color: C.orange, kind: "rect" });
              } else if (r.p50 != null) {
                t.push({ label: "ARR forecast P50", value: eur(r.p50), color: C.ink, kind: "line" });
                t.push({ label: "P10–P90", value: `${eur(r.p10)} – ${eur(r.p90)}`, color: C.blue, kind: "band" });
              }
              return <TipBox title={`${monthLabel(r.month)}${r.isForecast ? " · forecast" : ""}`} rows={t} />;
            }}
          />
          <Area
            dataKey="selfServe"
            stackId="a"
            stroke={C.blue}
            strokeWidth={1.5}
            fill={C.blue}
            fillOpacity={0.14}
            isAnimationActive={false}
            activeDot={false}
          />
          <Area
            dataKey="enterprise"
            stackId="a"
            stroke={C.orange}
            strokeWidth={1.5}
            fill={C.orange}
            fillOpacity={0.14}
            isAnimationActive={false}
            activeDot={false}
          />
          <Area dataKey="band" stroke="none" fill={C.blue} fillOpacity={0.1} isAnimationActive={false} activeDot={false} />
          <Line
            dataKey="p50"
            stroke={C.ink}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, stroke: "#fff", strokeWidth: 2 }}
            isAnimationActive={false}
          />
          <ReferenceLine
            x={asOfMonth}
            stroke={C.ink}
            strokeWidth={1}
            label={{ value: "Today", position: "insideTopRight", fill: C.inkSoft, fontSize: 11, offset: 6 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
