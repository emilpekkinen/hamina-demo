"use client";

import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { RotateCcw } from "lucide-react";
import type { ForecastData } from "@/lib/types";
import { C, axisProps, yAxisProps } from "@/lib/chart";
import { eur, eurTick, pct } from "@/lib/format";
import { TipBox, rowOf } from "./charts/Tip";
import { Card, CardHeader, DeltaPill, Empty, Legend, cx } from "./ui";

type Scen = ForecastData["scenarios"];
type Lever = Scen["levers"][number];

const decimals = (step: number) => (String(step).split(".")[1] ?? "").length;
const snap = (v: number, l: Lever) => {
  const s = Math.round((v - l.min) / l.step) * l.step + l.min;
  return Number(Math.max(l.min, Math.min(l.max, s)).toFixed(decimals(l.step)));
};
const fmtLever = (v: number, l: Lever) => {
  const d = decimals(l.step);
  const sign = v > 0 ? "+" : v < 0 ? "−" : "±";
  return `${sign}${Math.abs(v).toFixed(d)}${l.unit === "%" ? "%" : ` ${l.unit}`}`;
};

export function ScenarioPanel({ scenarios }: { scenarios: Scen }) {
  const { base, levers } = scenarios;
  const initial = useMemo(() => Object.fromEntries(levers.map((l) => [l.id, l.default ?? 0])), [levers]);
  const [vals, setVals] = useState<Record<string, number>>(initial);

  const contrib = levers.map((l) => {
    const v = vals[l.id] ?? 0;
    return { lever: l, v, fy: l.impact.fy2027Revenue * v, arr: l.impact.arrDec2027 * v };
  });
  const fy = base.fy2027Revenue + contrib.reduce((s, c) => s + c.fy, 0);
  const arr = base.arrDec2027 + contrib.reduce((s, c) => s + c.arr, 0);
  const dFy = fy - base.fy2027Revenue;
  const dArr = arr - base.arrDec2027;

  const preset = (dir: 1 | -1 | 0) =>
    setVals(
      Object.fromEntries(
        levers.map((l) => {
          if (dir === 0) return [l.id, l.default ?? 0];
          const good = Math.sign(l.impact.fy2027Revenue || l.impact.arrDec2027) || 1;
          const target = good * dir > 0 ? l.max : l.min;
          return [l.id, snap(target / 2, l)];
        }),
      ),
    );

  const chartRows = [
    { metric: "FY2027 revenue", base: base.fy2027Revenue, scenario: fy },
    { metric: "ARR Dec 2027", base: base.arrDec2027, scenario: arr },
  ];
  const maxAbs = Math.max(...contrib.map((c) => Math.abs(c.arr)), ...contrib.map((c) => Math.abs(c.fy)), 1);

  if (!levers.length) return <Empty>No scenario levers in this snapshot.</Empty>;

  return (
    <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-5">
      <Card className="xl:col-span-2">
        <CardHeader
          title="Levers"
          subtitle="Each lever shifts the base case linearly by its modelled impact."
          right={
            <div className="flex flex-wrap gap-1.5">
              <button type="button" onClick={() => preset(-1)} className="rounded-md bg-gray-100 px-2.5 py-1.5 text-xs font-medium text-gray-900 hover:bg-[#E5E5E8]">
                Downside
              </button>
              <button type="button" onClick={() => preset(1)} className="rounded-md bg-gray-100 px-2.5 py-1.5 text-xs font-medium text-gray-900 hover:bg-[#E5E5E8]">
                Upside
              </button>
              <button
                type="button"
                onClick={() => preset(0)}
                className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100"
              >
                <RotateCcw size={12} strokeWidth={2} aria-hidden /> Reset
              </button>
            </div>
          }
        />
        <ul className="space-y-5">
          {levers.map((l) => {
            const v = vals[l.id] ?? 0;
            const fill = ((v - l.min) / (l.max - l.min || 1)) * 100;
            const id = `lever-${l.id}`;
            return (
              <li key={l.id}>
                <div className="flex items-baseline justify-between gap-3">
                  <label htmlFor={id} className="text-sm font-medium text-gray-900">
                    {l.label}
                  </label>
                  <span
                    className={cx(
                      "rounded-md px-1.5 py-0.5 text-xs font-semibold tabular",
                      v === (l.default ?? 0) ? "bg-gray-100 text-gray-700" : "bg-blue-50 text-blue-500",
                    )}
                  >
                    {fmtLever(v, l)}
                  </span>
                </div>
                <input
                  id={id}
                  type="range"
                  className="hm-range mt-1"
                  min={l.min}
                  max={l.max}
                  step={l.step}
                  value={v}
                  onChange={(e) => setVals((s) => ({ ...s, [l.id]: snap(Number(e.target.value), l) }))}
                  style={{ ["--fill" as string]: `${fill}%` }}
                />
                <div className="flex justify-between text-[11px] tabular text-gray-400">
                  <span>{fmtLever(l.min, l)}</span>
                  <span className="text-gray-500">
                    per {l.unit === "%" ? "1%" : `1 ${l.unit}`}: {eur(l.impact.fy2027Revenue, { sign: true })} FY27
                  </span>
                  <span>{fmtLever(l.max, l)}</span>
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      <div className="flex min-w-0 flex-col gap-4 xl:col-span-3">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {[
            { label: "FY2027 revenue", value: fy, base: base.fy2027Revenue, d: dFy },
            { label: "ARR Dec 2027", value: arr, base: base.arrDec2027, d: dArr },
          ].map((k) => (
            <div key={k.label} className="rounded-xl border border-indigo-100 bg-white p-5 shadow-card">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">{k.label} · scenario</p>
              <div className="mt-2 flex flex-wrap items-baseline gap-2">
                <span className="text-[28px] font-bold leading-8 tracking-tight text-gray-900">{eur(k.value)}</span>
                <DeltaPill value={k.d} label={`${eur(k.d, { sign: true })} (${pct(k.base ? k.d / k.base : 0, 1, { sign: true })})`} />
              </div>
              <p className="mt-1.5 text-[13px] text-gray-500">Base case {eur(k.base)}</p>
            </div>
          ))}
        </div>

        <Card>
          <CardHeader title="Scenario vs base" right={<Legend items={[{ label: "Base", color: C.neutral }, { label: "Scenario", color: C.blue }]} />} />
          <div style={{ height: 200 }} className="w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartRows} layout="vertical" margin={{ top: 0, right: 56, bottom: 0, left: 0 }} barGap={4} barCategoryGap="28%">
                <CartesianGrid horizontal={false} stroke={C.grid} />
                <XAxis type="number" {...axisProps} tickFormatter={eurTick} />
                <YAxis type="category" dataKey="metric" {...yAxisProps} width={104} tick={{ fill: C.inkSoft, fontSize: 12 }} />
                <Tooltip
                  cursor={{ fill: C.grid, opacity: 0.6 }}
                  content={({ active, payload }) => {
                    const r = rowOf<(typeof chartRows)[number]>(payload);
                    if (!active || !r) return null;
                    return (
                      <TipBox
                        title={r.metric}
                        rows={[
                          { label: "scenario", value: eur(r.scenario), color: C.blue, kind: "rect" },
                          { label: "base", value: eur(r.base), color: C.neutral, kind: "rect" },
                          { label: "difference", value: eur(r.scenario - r.base, { sign: true }), kind: "none" },
                        ]}
                      />
                    );
                  }}
                />
                <Bar dataKey="base" fill={C.neutral} radius={[0, 4, 4, 0]} maxBarSize={20} isAnimationActive={false}>
                  <LabelList dataKey="base" position="right" formatter={(v: unknown) => eur(Number(v))} fill={C.axis} fontSize={11} />
                </Bar>
                <Bar dataKey="scenario" fill={C.blue} radius={[0, 4, 4, 0]} maxBarSize={20} isAnimationActive={false}>
                  <LabelList dataKey="scenario" position="right" formatter={(v: unknown) => eur(Number(v))} fill={C.ink} fontSize={11} fontWeight={600} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardHeader title="Impact by lever" subtitle="Change vs base case at the current slider positions." />
          <div className="mb-2 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] gap-3 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
            <span>Lever</span>
            <span className="text-center">FY2027 revenue</span>
            <span className="text-center">ARR Dec 2027</span>
          </div>
          <ul className="space-y-2">
            {contrib.map((c) => (
              <li key={c.lever.id} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] items-center gap-3">
                <span className="truncate text-[13px] text-gray-700">{c.lever.label}</span>
                {[c.fy, c.arr].map((x, i) => (
                  <span key={i} className="relative h-6" title={eur(x, { sign: true })}>
                    <span className="absolute inset-y-0 left-1/2 w-px bg-gray-200" aria-hidden />
                    <span
                      className="absolute top-1/2 h-3 -translate-y-1/2 rounded-[3px] transition-all duration-150"
                      style={{
                        width: `${(Math.abs(x) / maxAbs) * 34}%`,
                        left: x >= 0 ? "50%" : `${50 - (Math.abs(x) / maxAbs) * 34}%`,
                        background: x >= 0 ? C.blue : C.pink,
                      }}
                    />
                    {Math.abs(x) > 0 && (
                      <span
                        className="absolute top-1/2 -translate-y-1/2 text-[11px] font-semibold tabular text-gray-900"
                        style={x >= 0 ? { left: `calc(${50 + (Math.abs(x) / maxAbs) * 34}% + 4px)` } : { right: `calc(${50 + (Math.abs(x) / maxAbs) * 34}% + 4px)` }}
                      >
                        {eur(x, { sign: true })}
                      </span>
                    )}
                  </span>
                ))}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
