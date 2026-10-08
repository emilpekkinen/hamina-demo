"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, CreditCard } from "lucide-react";
import type { ForecastData } from "@/lib/types";
import { dateLabel, daysBetween, eur, eurFull, num, pct } from "@/lib/format";
import { Chip, Empty, Pill, TableWrap, cx, td, tdNum, th } from "./ui";
import { Segmented } from "./Segmented";

type Deal = ForecastData["deals"][number];
type SortKey = "name" | "stage" | "amount" | "hubspotProb" | "modelProb" | "delta" | "closeDateModel" | "expected";

const CATEGORY_LABEL: Record<string, string> = {
  commit: "Commit",
  best_case: "Best case",
  pipeline: "Pipeline",
};
const catLabel = (c: string) =>
  CATEGORY_LABEL[c] ?? c.replace(/_/g, " ").replace(/^\w/, (x) => x.toUpperCase());

function ProbCell({ hs, model }: { hs: number; model: number }) {
  const d = model - hs;
  const tone = d <= -0.05 ? "error" : d >= 0.05 ? "success" : "neutral";
  return (
    <div className="flex items-center justify-end gap-2 whitespace-nowrap">
      <span className="tabular text-gray-500" title="HubSpot stage probability">
        {pct(hs)}
      </span>
      <span className="text-gray-300" aria-hidden>
        →
      </span>
      <span className="tabular font-semibold text-gray-900" title="Model win probability">
        {pct(model)}
      </span>
      <Pill tone={tone} className="min-w-14 justify-center tabular">
        {d > 0 ? "+" : d < 0 ? "−" : "±"}
        {Math.abs(Math.round(d * 100))} pp
      </Pill>
    </div>
  );
}

export function DealsTable({ deals }: { deals: Deal[] }) {
  const categories = useMemo(() => {
    const order = ["commit", "best_case", "pipeline"];
    const rank = (c: string) => (order.includes(c) ? order.indexOf(c) : order.length);
    return Array.from(new Set(deals.map((d) => d.forecastCategory))).sort((a, b) => rank(a) - rank(b));
  }, [deals]);
  const [cat, setCat] = useState<string>("all");
  const [onlyLinked, setOnlyLinked] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "expected", dir: -1 });

  const rows = useMemo(() => {
    const f = deals.filter((d) => (cat === "all" || d.forecastCategory === cat) && (!onlyLinked || d.stripeLinked));
    const val = (d: Deal): string | number => {
      switch (sort.key) {
        case "name":
          return d.name.toLowerCase();
        case "stage":
          return d.stageOrder;
        case "amount":
          return d.amountEur;
        case "hubspotProb":
          return d.hubspotProb;
        case "modelProb":
          return d.modelProb;
        case "delta":
          return d.modelProb - d.hubspotProb;
        case "closeDateModel":
          return d.closeDateModel;
        case "expected":
          return d.amountEur * d.modelProb;
      }
    };
    return [...f].sort((a, b) => {
      const x = val(a), y = val(b);
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
    });
  }, [deals, cat, onlyLinked, sort]);

  const head = (key: SortKey, label: string, right = false, title?: string) => {
    const active = sort.key === key;
    const Icon = !active ? ArrowUpDown : sort.dir === 1 ? ArrowUp : ArrowDown;
    return (
      <th
        className={cx(th, right && "text-right")}
        aria-sort={active ? (sort.dir === 1 ? "ascending" : "descending") : "none"}
        title={title}
      >
        <button
          type="button"
          onClick={() =>
            setSort((s) => ({
              key,
              dir: s.key === key ? ((-s.dir) as 1 | -1) : key === "name" || key === "closeDateModel" ? 1 : -1,
            }))
          }
          className={cx("inline-flex items-center gap-1 uppercase hover:text-gray-900", active && "text-gray-900")}
        >
          {label}
          <Icon size={12} strokeWidth={2} className={active ? "text-blue-500" : "text-gray-400"} aria-hidden />
        </button>
      </th>
    );
  };

  const totAmt = rows.reduce((s, d) => s + d.amountEur, 0);
  const totExp = rows.reduce((s, d) => s + d.amountEur * d.modelProb, 0);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            label="Forecast category"
            value={cat}
            onChange={setCat}
            options={[{ value: "all", label: "All" }, ...categories.map((c) => ({ value: c, label: catLabel(c) }))]}
          />
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-gray-100 bg-white px-3 py-1 text-[13px] font-medium text-gray-700 hover:bg-gray-50">
            <input
              type="checkbox"
              checked={onlyLinked}
              onChange={(e) => setOnlyLinked(e.target.checked)}
              className="h-3.5 w-3.5 accent-[#3143E5]"
            />
            Paying self-serve only
          </label>
        </div>
        <p className="text-xs text-gray-500">
          {rows.length} deals · {eur(totAmt)} ·{" "}
          <span className="font-semibold text-gray-900">{eur(totExp)}</span> model-expected
        </p>
      </div>
      {rows.length === 0 ? (
        <Empty>No open deals match these filters.</Empty>
      ) : (
        <>
        <ul className="space-y-2 md:hidden">
          {rows.map((d) => {
            const flags = d.flags.filter((f) => !(d.stripeLinked && /self-serve/i.test(f)));
            return (
              <li key={d.id} className="rounded-lg border border-gray-100 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900">{d.company}</p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-xs text-gray-500">
                      <StageDots order={d.stageOrder} /> {d.stage} · {d.owner}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="tabular text-sm font-semibold text-gray-900">{eur(d.amountEur)}</p>
                    <p className="tabular text-xs text-gray-500">exp. {eur(d.amountEur * d.modelProb)}</p>
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="text-xs text-gray-500">Win prob. HubSpot → model</span>
                  <ProbCell hs={d.hubspotProb} model={d.modelProb} />
                </div>
                <p className="tabular mt-1 text-xs text-gray-500">
                  Close: rep <span className="text-gray-900">{dateLabel(d.closeDateRep, true)}</span> → model{" "}
                  <span className="font-medium text-gray-900">{dateLabel(d.closeDateModel, true)}</span>
                </p>
                {(d.stripeLinked || flags.length > 0) && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {d.stripeLinked && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#F0E9FE] px-2 py-0.5 text-[11px] font-medium text-[#6726F5]">
                        <CreditCard size={12} strokeWidth={1.75} aria-hidden />
                        Paying self-serve{d.selfServeSeats ? ` · ${num(d.selfServeSeats)} seats` : ""}
                      </span>
                    )}
                    {flags.map((f) => (
                      <Chip key={f} tone={/push|no activity|past|stuck/i.test(f) ? "warning" : "neutral"}>{f}</Chip>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        <div className="hidden md:block">
        <TableWrap>
          <thead>
            <tr>
              {head("name", "Deal")}
              {head("stage", "Stage")}
              {head("amount", "Amount", true)}
              {head("delta", "Win prob: HubSpot → model", true, "HubSpot stage probability vs model probability")}
              {head("expected", "Expected", true, "Amount × model probability")}
              {head("closeDateModel", "Close · rep vs model")}
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => {
              const slip = daysBetween(d.closeDateRep, d.closeDateModel);
              const flags = d.flags.filter((f) => !(d.stripeLinked && /self-serve/i.test(f)));
              return (
                <tr key={d.id} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className={cx(td, "min-w-64")}>
                    <div className="font-medium text-gray-900">{d.name}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500">
                      <span>{d.owner}</span>
                      <span className="text-gray-300">·</span>
                      <span>{d.leadSource}</span>
                    </div>
                    {(d.stripeLinked || flags.length > 0) && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {d.stripeLinked && (
                          <span
                            className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-[#F0E9FE] px-2 py-0.5 text-[11px] font-medium text-[#6726F5]"
                            title={d.selfServeSeats ? `${d.selfServeSeats} self-serve seats on Stripe` : "Matched to a paying Stripe customer"}
                          >
                            <CreditCard size={12} strokeWidth={1.75} aria-hidden />
                            Paying self-serve account
                            {d.selfServeSeats ? ` · ${num(d.selfServeSeats)} seats` : ""}
                          </span>
                        )}
                        {flags.map((f) => (
                          <Chip key={f} tone={/push|no activity|past|stuck/i.test(f) ? "warning" : "neutral"}>
                            {f}
                          </Chip>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className={cx(td, "whitespace-nowrap")}>
                    <div className="flex items-center gap-2">
                      <StageDots order={d.stageOrder} />
                      <span className="text-gray-900">{d.stage}</span>
                    </div>
                    <div className="mt-0.5 text-xs text-gray-500">
                      {num(d.daysInStage)} days in stage · {catLabel(d.forecastCategory)}
                    </div>
                  </td>
                  <td className={tdNum}>
                    {eur(d.amountEur)}
                    {d.currency !== "EUR" && (
                      <div className="text-xs font-normal text-gray-500">
                        {d.currency} {num(d.amount)}
                      </div>
                    )}
                  </td>
                  <td className={cx(td, "text-right")}>
                    <ProbCell hs={d.hubspotProb} model={d.modelProb} />
                  </td>
                  <td className={tdNum} title={eurFull(d.amountEur * d.modelProb)}>
                    {eur(d.amountEur * d.modelProb)}
                  </td>
                  <td className={cx(td, "whitespace-nowrap tabular")}>
                    <div className="text-gray-500">
                      Rep <span className="text-gray-900">{dateLabel(d.closeDateRep, true)}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-gray-500">Model</span>
                      <span className="font-medium text-gray-900">{dateLabel(d.closeDateModel, true)}</span>
                      {slip !== 0 && (
                        <span className={cx("text-xs font-medium", slip > 30 ? "text-error" : "text-warning-text")}>
                          {slip > 0 ? "+" : "−"}
                          {Math.abs(slip)}d
                        </span>
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

function StageDots({ order }: { order: number }) {
  return (
    <span className="flex gap-0.5" aria-hidden>
      {[0, 1, 2, 3, 4].map((i) => (
        <span key={i} className={cx("h-1.5 w-1.5 rounded-full", i <= order ? "bg-blue-500" : "bg-gray-200")} />
      ))}
    </span>
  );
}
