"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import type { ForecastData } from "@/lib/types";
import { dateLabel, daysBetween, eur, num, pct } from "@/lib/format";
import { Chip, Empty, Pill, TableWrap, cx, td, tdNum, th } from "./ui";
import { Segmented } from "./Segmented";

type Renewal = ForecastData["renewals"][number];
type SortKey = "name" | "arr" | "renewalDate" | "pRenew" | "risk" | "arrAtRisk";

const riskRank = { high: 0, medium: 1, low: 2 } as const;
const riskTone = { high: "error", medium: "warning", low: "success" } as const;

export function RenewalsTable({ renewals, asOf }: { renewals: Renewal[]; asOf: string }) {
  const [seg, setSeg] = useState<"all" | Renewal["segment"]>("all");
  const [risk, setRisk] = useState<"all" | "atRisk">("all");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "arrAtRisk", dir: -1 });

  const rows = useMemo(() => {
    const f = renewals.filter(
      (r) => (seg === "all" || r.segment === seg) && (risk === "all" || r.riskLevel !== "low"),
    );
    const val = (r: Renewal): string | number => {
      switch (sort.key) {
        case "name":
          return (r.company ?? r.name).toLowerCase();
        case "arr":
          return r.arr;
        case "renewalDate":
          return r.renewalDate;
        case "pRenew":
          return r.pRenew;
        case "risk":
          return riskRank[r.riskLevel] ?? 3;
        case "arrAtRisk":
          return r.arr * (1 - r.pRenew);
      }
    };
    return [...f].sort((a, b) => {
      const x = val(a), y = val(b);
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
    });
  }, [renewals, seg, risk, sort]);

  const totalAtRisk = rows.reduce((s, r) => s + r.arr * (1 - r.pRenew), 0);
  const totalArr = rows.reduce((s, r) => s + r.arr, 0);

  const head = (key: SortKey, label: string, right = false) => {
    const active = sort.key === key;
    const Icon = !active ? ArrowUpDown : sort.dir === 1 ? ArrowUp : ArrowDown;
    return (
      <th className={cx(th, right && "text-right")} aria-sort={active ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
        <button
          type="button"
          onClick={() => setSort((s) => ({ key, dir: s.key === key ? ((-s.dir) as 1 | -1) : key === "name" || key === "renewalDate" || key === "pRenew" || key === "risk" ? 1 : -1 }))}
          className={cx("inline-flex items-center gap-1 uppercase hover:text-gray-900", active && "text-gray-900")}
        >
          {label}
          <Icon size={12} strokeWidth={2} className={active ? "text-blue-500" : "text-gray-400"} aria-hidden />
        </button>
      </th>
    );
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            value={seg}
            onChange={setSeg}
            options={[
              { value: "all", label: "All" },
              { value: "self_serve", label: "Self-serve" },
              { value: "enterprise", label: "Enterprise" },
            ]}
          />
          <Segmented
            value={risk}
            onChange={setRisk}
            options={[
              { value: "all", label: "All risk" },
              { value: "atRisk", label: "Medium + high" },
            ]}
          />
        </div>
        <p className="text-xs text-gray-500">
          {rows.length} renewals · {eur(totalArr)} ARR ·{" "}
          <span className="font-semibold text-gray-900">{eur(totalAtRisk)}</span> expected ARR at risk
        </p>
      </div>
      {rows.length === 0 ? (
        <Empty>No renewals match these filters.</Empty>
      ) : (
        <>
        <ul className="space-y-2 md:hidden">
          {rows.map((r) => (
            <li key={r.customerId} className="rounded-lg border border-gray-100 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900">{r.company ?? r.name}</p>
                  <p className="text-xs text-gray-500">
                    {r.plan}{r.segment === "self_serve" ? ` · ${num(r.seats)} seats` : ""}{r.owner ? ` · ${r.owner}` : ""}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="tabular text-sm font-semibold text-gray-900">{eur(r.arr)}</p>
                  <p className="tabular text-xs text-gray-500">{dateLabel(r.renewalDate, true)} · {daysBetween(asOf, r.renewalDate)} d</p>
                </div>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <Pill tone={riskTone[r.riskLevel] ?? "neutral"}>
                  <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
                  {pct(r.pRenew)} renew
                </Pill>
                <span className="tabular text-xs text-gray-500">{eur(r.arr * (1 - r.pRenew))} at risk</span>
              </div>
              {r.signals.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {r.signals.map((s) => <Chip key={s}>{s}</Chip>)}
                </div>
              )}
            </li>
          ))}
        </ul>
        <div className="hidden md:block">
        <TableWrap>
          <thead>
            <tr>
              {head("name", "Customer")}
              <th className={th}>Plan</th>
              {head("arr", "ARR", true)}
              {head("renewalDate", "Renews")}
              {head("pRenew", "P(renew)", true)}
              {head("risk", "Risk")}
              {head("arrAtRisk", "ARR at risk", true)}
              <th className={th}>Signals</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const days = daysBetween(asOf, r.renewalDate);
              return (
                <tr key={r.customerId} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className={td}>
                    <div className="font-medium text-gray-900">{r.company ?? r.name}</div>
                    <div className="text-xs text-gray-500">
                      {r.segment === "enterprise" ? "Enterprise" : "Self-serve"}
                      {r.owner ? ` · ${r.owner}` : ""}
                    </div>
                  </td>
                  <td className={cx(td, "whitespace-nowrap")}>
                    {r.plan}
                    <div className="text-xs text-gray-500">{num(r.seats)} seats</div>
                  </td>
                  <td className={tdNum}>{eur(r.arr)}</td>
                  <td className={cx(td, "whitespace-nowrap tabular")}>
                    {dateLabel(r.renewalDate, true)}
                    <div className="text-xs text-gray-500">in {days} days</div>
                  </td>
                  <td className={tdNum}>{pct(r.pRenew)}</td>
                  <td className={td}>
                    <Pill tone={riskTone[r.riskLevel] ?? "neutral"}>
                      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
                      {r.riskLevel[0].toUpperCase() + r.riskLevel.slice(1)}
                    </Pill>
                  </td>
                  <td className={tdNum}>{eur(r.arr * (1 - r.pRenew))}</td>
                  <td className={cx(td, "min-w-56")}>
                    <div className="flex flex-wrap gap-1">
                      {r.signals.length ? (
                        r.signals.map((s) => <Chip key={s}>{s}</Chip>)
                      ) : (
                        <span className="text-xs text-gray-400">No risk signals</span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </TableWrap>
        </div>
        </>
      )}
    </div>
  );
}
