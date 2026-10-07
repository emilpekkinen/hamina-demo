"use client";

import {
  Area,
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
import { TipBox, rowOf, type TipRow } from "./Tip";

type Row = {
  month: string;
  actual: number | null;
  p50: number | null;
  band: [number, number] | null;
  p10: number | null;
  p90: number | null;
  isForecast: boolean;
};

export function buildFanRows(
  monthly: ForecastData["monthly"],
  pick: "revenue" | "arr",
): Row[] {
  const rows: Row[] = monthly.map((m) => {
    const actual = pick === "revenue" ? m.actualRevenue : m.actualArr;
    const b = pick === "revenue" ? m.revenue : m.arr;
    return {
      month: m.month,
      actual,
      p50: b ? b.p50 : null,
      p10: b ? b.p10 : null,
      p90: b ? b.p90 : null,
      band: b ? [b.p10, b.p90] : null,
      isForecast: actual == null && !!b,
    };
  });
  // Anchor the forecast line/band to the last actual point so the fan opens from "today".
  const lastActual = rows.reduce((idx, r, i) => (r.actual != null ? i : idx), -1);
  if (lastActual >= 0 && rows[lastActual + 1]?.p50 != null) {
    const a = rows[lastActual].actual!;
    rows[lastActual] = { ...rows[lastActual], p50: a, band: [a, a] };
  }
  return rows;
}

export function yearTicks(months: string[]) {
  return months.filter((m) => m.endsWith("-01") || m.endsWith("-07"));
}

export function RevenueFanChart({
  monthly,
  asOfMonth,
  height = 300,
}: {
  monthly: ForecastData["monthly"];
  asOfMonth: string;
  height?: number;
}) {
  const rows = buildFanRows(monthly, "revenue");
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 16, right: 8, bottom: 0, left: 0 }} barCategoryGap="22%">
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
              const rows: TipRow[] = [];
              if (r.actual != null) rows.push({ label: "Actual revenue", value: eur(r.actual), color: C.blue, kind: "rect" });
              if (r.isForecast && r.p50 != null) {
                rows.push({ label: "Forecast P50", value: eur(r.p50), color: C.blue, kind: "line" });
                rows.push({ label: "P10–P90", value: `${eur(r.p10)} – ${eur(r.p90)}`, color: C.blue, kind: "band" });
              }
              return <TipBox title={`${monthLabel(r.month)}${r.isForecast ? " · forecast" : ""}`} rows={rows} />;
            }}
          />
          <Area
            dataKey="band"
            stroke="none"
            fill={C.blue}
            fillOpacity={0.12}
            isAnimationActive={false}
            connectNulls={false}
            activeDot={false}
          />
          <Bar dataKey="actual" fill={C.blue} radius={[4, 4, 0, 0]} maxBarSize={18} isAnimationActive={false} />
          <Line
            dataKey="p50"
            stroke={C.blue}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, stroke: "#fff", strokeWidth: 2 }}
            strokeLinecap="round"
            isAnimationActive={false}
            connectNulls={false}
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
