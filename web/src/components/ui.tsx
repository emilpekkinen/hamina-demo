import type { ReactNode } from "react";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

/* ---------- Page + section headers ---------- */

export function PageHeader({
  eyebrow,
  title,
  accent,
  after,
  lead,
  actions,
}: {
  eyebrow?: string;
  title: string;
  accent?: string;
  after?: string;
  lead?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-3xl">
        {eyebrow && (
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">{eyebrow}</p>
        )}
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-gray-900 sm:text-[28px] sm:leading-9">
          {title}
          {accent && <span className="text-blue-500"> {accent}</span>}
          {after && <> {after}</>}
        </h1>
        {lead && <p className="mt-2 text-[15px] leading-6 text-gray-500">{lead}</p>}
      </div>
      {actions}
    </div>
  );
}

/* ---------- Card ---------- */

export function Card({
  children,
  className,
  padded = true,
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <section
      className={cx(
        "min-w-0 rounded-xl border border-gray-100 bg-white shadow-card",
        padded && "p-5 sm:p-6",
        className,
      )}
    >
      {children}
    </section>
  );
}

export function CardHeader({
  title,
  subtitle,
  eyebrow,
  right,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  eyebrow?: string;
  right?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        {eyebrow && (
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-gray-500">{eyebrow}</p>
        )}
        <h2 className="text-base font-semibold leading-6 text-gray-900">{title}</h2>
        {subtitle && <p className="mt-0.5 text-[13px] leading-5 text-gray-500">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

/* ---------- KPI card ---------- */

export function KpiCard({
  label,
  value,
  delta,
  sub,
  footer,
  highlight,
}: {
  label: string;
  value: ReactNode;
  delta?: ReactNode;
  sub?: ReactNode;
  footer?: ReactNode;
  highlight?: boolean;
}) {
  return (
    <div
      className={cx(
        "flex min-w-0 flex-col rounded-xl border bg-white p-4 shadow-card sm:p-5",
        highlight ? "border-indigo-100" : "border-gray-100",
      )}
    >
      <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">{label}</p>
      <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-[22px] font-bold leading-7 tracking-tight text-gray-900 sm:text-[28px] sm:leading-8">{value}</span>
        {delta}
      </div>
      {sub && <div className="mt-1.5 text-xs leading-[18px] text-gray-500 sm:text-[13px] sm:leading-5">{sub}</div>}
      {footer && <div className="mt-auto pt-3">{footer}</div>}
    </div>
  );
}

/* ---------- Pills / chips ---------- */

type Tone = "success" | "warning" | "error" | "neutral" | "brand" | "violet";

const toneClass: Record<Tone, string> = {
  success: "bg-success-bg text-success",
  warning: "bg-warning-bg text-warning-text",
  error: "bg-error-bg text-error",
  neutral: "bg-gray-100 text-gray-700",
  brand: "bg-blue-50 text-blue-500",
  violet: "bg-[#F0E9FE] text-[#6726F5]",
};

export function Pill({
  tone = "neutral",
  children,
  className,
  title,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cx(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium",
        toneClass[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Signed delta pill. good=true means up is good. */
export function DeltaPill({
  value,
  label,
  goodWhenPositive = true,
}: {
  value: number;
  label: string;
  goodWhenPositive?: boolean;
}) {
  const up = value > 0;
  const flat = Math.abs(value) < 1e-9;
  const good = flat ? null : up === goodWhenPositive;
  return (
    <Pill tone={good === null ? "neutral" : good ? "success" : "error"}>
      <span aria-hidden>{flat ? "•" : up ? "▲" : "▼"}</span>
      {label}
    </Pill>
  );
}

export function Chip({ children, tone = "neutral" }: { children: ReactNode; tone?: Tone }) {
  return (
    <span
      className={cx(
        "inline-flex items-center whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-medium leading-4",
        tone === "neutral" ? "bg-gray-100 text-gray-700" : toneClass[tone],
      )}
    >
      {children}
    </span>
  );
}

/* ---------- Legend ---------- */

export function Legend({
  items,
  className,
}: {
  items: { label: string; color: string; kind?: "rect" | "line" | "band" | "dash" | "dot" }[];
  className?: string;
}) {
  return (
    <ul className={cx("flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-gray-600", className)}>
      {items.map((it) => (
        <li key={it.label} className="flex items-center gap-1.5">
          <LegendKey color={it.color} kind={it.kind ?? "rect"} />
          {it.label}
        </li>
      ))}
    </ul>
  );
}

export function LegendKey({ color, kind }: { color: string; kind: "rect" | "line" | "band" | "dash" | "dot" }) {
  if (kind === "line") return <span className="inline-block h-0.5 w-3.5 rounded-full" style={{ background: color }} />;
  if (kind === "dash")
    return <span className="inline-block w-3.5 border-t-2 border-dashed" style={{ borderColor: color }} />;
  if (kind === "dot") return <span className="inline-block h-2 w-2 rounded-full" style={{ background: color }} />;
  if (kind === "band")
    return <span className="inline-block h-2.5 w-3.5 rounded-sm" style={{ background: color, opacity: 0.18 }} />;
  return <span className="inline-block h-2.5 w-2.5 rounded-[3px]" style={{ background: color }} />;
}

/* ---------- Table chrome ---------- */

export const th =
  "bg-gray-50 px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500 whitespace-nowrap";
export const td = "px-3 py-3 text-sm text-gray-700 align-middle";
export const tdNum = "px-3 py-3 text-sm text-right tabular text-gray-900 font-medium whitespace-nowrap align-middle";

export function TableWrap({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx("overflow-x-auto rounded-lg border border-gray-100", className)}>
      <table className="w-full border-collapse">{children}</table>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-24 items-center justify-center rounded-lg border border-dashed border-gray-200 px-4 py-8 text-sm text-gray-500">
      {children}
    </div>
  );
}

/** Collapsible table-view twin of a chart (dataviz: tooltips never gate values). */
export function TableView({
  columns,
  rows,
  label = "View as table",
}: {
  columns: string[];
  rows: (string | number)[][];
  label?: string;
}) {
  if (!rows.length) return null;
  return (
    <details className="group mt-3">
      <summary className="inline-flex cursor-pointer select-none list-none items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-900 [&::-webkit-details-marker]:hidden">
        <span className="transition-transform group-open:rotate-90" aria-hidden>
          ›
        </span>
        {label}
      </summary>
      <div className="mt-2 max-h-72 overflow-auto rounded-lg border border-gray-100">
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0">
            <tr>
              {columns.map((c, i) => (
                <th key={c} className={cx(th, "py-2", i > 0 && "text-right")}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-gray-100">
                {r.map((cell, j) => (
                  <td
                    key={j}
                    className={cx("px-3 py-1.5 text-gray-700", j > 0 && "text-right tabular text-gray-900")}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">{label}</p>
      <p className="mt-1 text-xl font-bold tracking-tight text-gray-900">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-gray-500">{sub}</p>}
    </div>
  );
}
