"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Check, CreditCard, Loader2, Megaphone, RotateCcw, Users } from "lucide-react";
import type { Dataset } from "@/lib/types";
import { cx } from "./ui";

const KEY = "hamina-analysis-run";
const REPLAY_EVENT = "hamina:replay-analysis";
const ICONS: Record<string, typeof CreditCard> = { stripe: CreditCard, hubspot: Users, ads: Megaphone };

export type GateStep = { label: string; detail: string; count?: number };

type Phase = "checking" | "review" | "running" | "done";

function readRun() {
  try {
    return sessionStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}
function writeRun(v: boolean) {
  try {
    if (v) sessionStorage.setItem(KEY, "1");
    else sessionStorage.removeItem(KEY);
  } catch {
    /* storage blocked: gate simply shows again next load */
  }
}

/** Header button that brings the data room back. */
export function ReplayAnalysisButton() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(REPLAY_EVENT))}
      className="hidden items-center gap-1.5 rounded-full border border-gray-100 bg-white px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900 md:inline-flex"
    >
      <RotateCcw size={12} /> Replay analysis
    </button>
  );
}

/* ---------- slide to run ---------- */

function SlideToRun({ onComplete, disabled }: { onComplete: () => void; disabled?: boolean }) {
  const track = useRef<HTMLDivElement>(null);
  const [x, setX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef(0);
  const KNOB = 52;

  const max = () => (track.current ? track.current.clientWidth - KNOB - 8 : 1);
  const finish = useCallback(() => {
    setX(max());
    onComplete();
  }, [onComplete]);

  function down(e: React.PointerEvent) {
    if (disabled) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    start.current = e.clientX - x;
    setDragging(true);
  }
  function move(e: React.PointerEvent) {
    if (!dragging) return;
    setX(Math.min(max(), Math.max(0, e.clientX - start.current)));
  }
  function up() {
    if (!dragging) return;
    setDragging(false);
    if (x > max() * 0.88) finish();
    else setX(0);
  }
  const progress = x / max();

  return (
    <div
      ref={track}
      className="relative h-[60px] w-full select-none overflow-hidden rounded-full bg-gray-900 p-1"
      role="group"
      aria-label="Slide to run the analysis"
    >
      <div
        className="absolute inset-y-1 left-1 rounded-full bg-blue-500"
        style={{ width: x + KNOB, transition: dragging ? "none" : "width .35s ease" }}
        aria-hidden
      />
      <span
        className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm font-semibold tracking-wide text-white"
        style={{ opacity: 1 - progress * 1.4 }}
      >
        <span className="shimmer-text">Slide to run the analysis</span>
      </span>
      <button
        type="button"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " " || e.key === "ArrowRight") {
            e.preventDefault();
            finish();
          }
        }}
        disabled={disabled}
        aria-label="Run the analysis (drag right, or press Enter)"
        className="relative z-10 flex h-[52px] w-[52px] cursor-grab touch-none items-center justify-center rounded-full bg-white text-blue-500 shadow-lg outline-none focus-visible:ring-4 focus-visible:ring-blue-300 active:cursor-grabbing"
        style={{ transform: `translateX(${x}px)`, transition: dragging ? "none" : "transform .35s ease" }}
      >
        <ArrowRight size={22} strokeWidth={2.4} />
      </button>
    </div>
  );
}

/* ---------- running sequence ---------- */

function useCountUp(target: number, active: boolean, ms: number) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!active) return;
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      setV(Math.round(target * (1 - (1 - p) ** 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, active, ms]);
  return v;
}

function StepRow({ step, state, ms }: { step: GateStep; state: "wait" | "run" | "ok"; ms: number }) {
  const n = useCountUp(step.count ?? 0, state !== "wait", ms);
  return (
    <li className={cx("flex items-start gap-3 transition-opacity duration-300", state === "wait" && "opacity-35")}>
      <span
        className={cx(
          "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
          state === "ok" ? "bg-blue-500 text-white" : "bg-gray-100 text-gray-500",
        )}
      >
        {state === "ok" ? <Check size={14} strokeWidth={3} /> : state === "run" ? <Loader2 size={14} className="animate-spin" /> : null}
      </span>
      <div className="min-w-0">
        <p className="text-[15px] font-semibold text-gray-900">
          {step.label}
          {step.count != null && state !== "wait" && (
            <span className="tabular ml-2 text-blue-500">{n.toLocaleString("en-US")}</span>
          )}
        </p>
        <p className="text-[13px] text-gray-500">{step.detail}</p>
      </div>
    </li>
  );
}

/* ---------- gate ---------- */

export function AnalysisGate({ datasets, steps, result }: { datasets: Dataset[]; steps: GateStep[]; result: string }) {
  const [phase, setPhase] = useState<Phase>("checking");
  const [source, setSource] = useState(datasets[0]?.id ?? "");
  const [table, setTable] = useState(0);
  const [seen, setSeen] = useState<Set<string>>(() => new Set(datasets[0] ? [datasets[0].id] : []));
  const [active, setActive] = useState(-1);
  const [leaving, setLeaving] = useState(false);
  const reduced = useRef(false);

  useEffect(() => {
    reduced.current = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    setPhase(readRun() ? "done" : "review");
    const replay = () => {
      writeRun(false);
      setLeaving(false);
      setActive(-1);
      setPhase("review");
      window.scrollTo({ top: 0 });
    };
    window.addEventListener(REPLAY_EVENT, replay);
    return () => window.removeEventListener(REPLAY_EVENT, replay);
  }, []);

  // No root scroll lock on purpose: toggling overflow on <html> leaves iOS Safari unable to scroll
  // until the page re-lays out (e.g. rotation). The overlay is opaque and contains its own scrolling.

  const stepMs = reduced.current ? 250 : 750;
  const run = useCallback(() => {
    setPhase("running");
    setActive(0);
  }, []);

  useEffect(() => {
    if (phase !== "running" || active < 0) return;
    const t = setTimeout(() => {
      if (active < steps.length) setActive(active + 1);
      else {
        writeRun(true);
        setLeaving(true);
        setTimeout(() => {
          window.scrollTo({ top: 0 });
          setPhase("done");
        }, reduced.current ? 50 : 650);
      }
    }, active < steps.length ? stepMs : reduced.current ? 300 : 1100);
    return () => clearTimeout(t);
  }, [phase, active, steps.length, stepMs]);

  if (phase === "done") return null;

  const ds = datasets.find((d) => d.id === source) ?? datasets[0];
  const tbl = ds?.tables[Math.min(table, (ds?.tables.length ?? 1) - 1)];
  const totalRows = datasets.reduce((s, d) => s + d.totalRows, 0);

  return (
    <div
      className={cx(
        "fixed inset-0 z-50 overflow-y-auto overscroll-contain bg-white transition-[opacity,transform] duration-[650ms] ease-out",
        leaving && "pointer-events-none -translate-y-6 opacity-0",
      )}
      role="dialog"
      aria-modal="true"
      aria-label="Data room: review the datasets and run the analysis"
    >
      <div className="mx-auto flex min-h-full max-w-[1180px] flex-col px-4 pt-5 sm:px-8 sm:pt-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Image src="/hamina-logo.svg" alt="Hamina" width={96} height={24} priority />
            <span className="rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-blue-500">
              RevOps
            </span>
          </div>
          <span className="rounded-full bg-warning-bg px-2.5 py-1 text-[11px] font-semibold text-warning-text">
            DEMO · synthetic data
          </span>
        </div>

        {phase !== "running" ? (
          <>
            <div className="mt-6 max-w-3xl sm:mt-8">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Step 1 of 2 · Data room</p>
              <h1 className="mt-1 text-[26px] font-bold leading-8 tracking-tight text-gray-900 sm:text-[40px] sm:leading-[48px]">
                Here is the data. <span className="text-blue-500">Have a look first.</span>
              </h1>
              <p className="mt-3 text-sm leading-6 text-gray-500 sm:text-[15px]">
                {totalRows.toLocaleString("en-US")} rows from three systems that today live apart. Browse the raw tables,
                then run the analysis to join them, train the models and simulate the next 15 months.
              </p>
            </div>

            <div className="mt-5 grid grid-cols-3 gap-2 sm:mt-6 sm:gap-3">
              {datasets.map((d) => {
                const Icon = ICONS[d.id] ?? CreditCard;
                const on = d.id === ds?.id;
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => {
                      setSource(d.id);
                      setTable(0);
                      setSeen((s) => new Set(s).add(d.id));
                    }}
                    className={cx(
                      "relative rounded-xl border p-3 text-left transition-all sm:p-4",
                      on ? "border-blue-500 bg-blue-50/40 shadow-[0_0_0_3px_rgba(49,67,229,.12)]" : "border-gray-100 bg-white hover:border-gray-200",
                    )}
                  >
                    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
                      <span className="flex items-center gap-2 text-sm font-semibold text-gray-900 sm:text-base">
                        <span className={cx("flex h-7 w-7 items-center justify-center rounded-md", on ? "bg-blue-500 text-white" : "bg-gray-50 text-gray-700")}>
                          <Icon size={15} />
                        </span>
                        {d.name}
                      </span>
                      {seen.has(d.id) && (
                        <span className="absolute right-2 top-2 flex items-center gap-1 text-[11px] font-medium text-success sm:static">
                          <Check size={12} strokeWidth={3} /> <span className="hidden sm:inline">Reviewed</span>
                        </span>
                      )}
                    </div>
                    <p className="mt-2 hidden text-[13px] text-gray-500 sm:block">{d.description}</p>
                    <p className="tabular mt-2 text-[11px] text-gray-600 sm:mt-3 sm:text-xs">
                      <b className="text-gray-900">{d.totalRows.toLocaleString("en-US")}</b> rows
                      <span className="hidden sm:inline"> · {d.tables.length} tables · {d.dateRange[0]?.slice(0, 7)} → {d.dateRange[1]?.slice(0, 7)}</span>
                    </p>
                  </button>
                );
              })}
            </div>

            {ds && tbl && (
              <div className="mt-4 rounded-xl border border-gray-100 bg-white shadow-card">
                <div className="flex flex-wrap items-center gap-1 border-b border-gray-100 px-3 pt-3">
                  {ds.tables.map((t, i) => (
                    <button
                      key={t.name}
                      type="button"
                      onClick={() => setTable(i)}
                      className={cx(
                        "-mb-px rounded-t-md border-b-2 px-3 py-2 font-mono text-xs",
                        i === table ? "border-blue-500 font-semibold text-gray-900" : "border-transparent text-gray-500 hover:text-gray-900",
                      )}
                    >
                      {t.name} <span className="text-gray-400">{t.rows.toLocaleString("en-US")}</span>
                    </button>
                  ))}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-xs">
                    <thead>
                      <tr>
                        {tbl.columns.map((c) => (
                          <th key={c} className="whitespace-nowrap bg-gray-50 px-3 py-2 text-left font-mono font-medium text-gray-500">
                            {c}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {tbl.sample.map((r, i) => (
                        <tr key={i} className="border-t border-gray-100">
                          {r.map((v, j) => (
                            <td key={j} className="max-w-[260px] truncate whitespace-nowrap px-3 py-2 text-gray-700">
                              {v == null ? "–" : String(v)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="border-t border-gray-100 px-3 py-2 text-[11px] text-gray-400">
                  Showing the {tbl.sample.length} most recent of {tbl.rows.toLocaleString("en-US")} rows · same shape as the{" "}
                  {ds.name} API export
                </p>
              </div>
            )}

            <div className="sticky bottom-0 z-10 -mx-4 mt-auto bg-gradient-to-t from-white from-75% to-white/0 px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-8 sm:-mx-8 sm:px-8">
              <div className="mx-auto max-w-[560px]">
                <p className="mb-2 text-center text-[11px] font-semibold uppercase tracking-wider text-gray-500 sm:mb-3 sm:text-xs">
                  Step 2 of 2 · {seen.size} of {datasets.length} sources reviewed
                </p>
                <SlideToRun onComplete={run} disabled={phase === "checking"} />
                <p className="mt-2 text-center text-[11px] text-gray-400">Drag the handle to the right (or focus it and press Enter)</p>
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center py-10">
            <div className="w-full max-w-[560px]">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Running analysis</p>
              <h2 className="mt-1 text-2xl font-bold tracking-tight text-gray-900">
                Joining, modelling, <span className="text-blue-500">simulating</span>
              </h2>
              <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-gray-100">
                <div
                  className="h-full rounded-full bg-blue-500 transition-[width] duration-500 ease-out"
                  style={{ width: `${(Math.min(active, steps.length) / steps.length) * 100}%` }}
                />
              </div>
              <ol className="mt-6 space-y-4">
                {steps.map((s, i) => (
                  <StepRow key={s.label} step={s} ms={stepMs * 0.9} state={i < active ? "ok" : i === active ? "run" : "wait"} />
                ))}
              </ol>
              <p
                className={cx(
                  "mt-6 rounded-xl bg-blue-50 px-4 py-3 text-[15px] font-semibold text-blue-600 transition-all duration-500",
                  active >= steps.length ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
                )}
              >
                {result}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
