"use client";

import type { ReactNode } from "react";

export type TipRow = {
  label: string;
  value: ReactNode;
  color?: string;
  kind?: "line" | "rect" | "band" | "none";
  muted?: boolean;
};

/** Hamina tooltip: rounded-lg bg-gray-900 text-white text-xs. Value leads, label follows. */
export function TipBox({ title, rows, footer }: { title: ReactNode; rows: TipRow[]; footer?: ReactNode }) {
  return (
    <div className="pointer-events-none min-w-44 rounded-lg bg-gray-900 px-3.5 py-2.5 text-xs text-white shadow-lg">
      <p className="mb-1.5 font-semibold text-white">{title}</p>
      <ul className="space-y-1">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center gap-2">
            {r.kind !== "none" && (
              <span
                aria-hidden
                className={
                  r.kind === "band"
                    ? "inline-block h-2 w-3 rounded-sm opacity-50"
                    : r.kind === "rect"
                      ? "inline-block h-2 w-2 rounded-[2px]"
                      : "inline-block h-0.5 w-3 rounded-full"
                }
                style={{ background: r.color ?? "#fff" }}
              />
            )}
            <span className="tabular font-semibold text-white">{r.value}</span>
            <span className={r.muted ? "text-gray-500" : "text-gray-400"}>{r.label}</span>
          </li>
        ))}
      </ul>
      {footer && <div className="mt-1.5 border-t border-white/10 pt-1.5 text-gray-400">{footer}</div>}
    </div>
  );
}

/** Extract the row object from a Recharts tooltip payload. */
export function rowOf<T>(payload: unknown): T | null {
  const p = payload as { payload?: T }[] | undefined;
  return p && p.length && p[0]?.payload ? (p[0].payload as T) : null;
}
