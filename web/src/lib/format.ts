// Formatting helpers. Everything is EUR; all numbers come from forecast.json.

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function trimZeros(s: string) {
  return s.replace(/\.0+$/, "").replace(/(\.\d*[1-9])0+$/, "$1");
}

/** Compact EUR: €3.15M, €263k, €940. */
export function eur(v: number | null | undefined, opts: { digits?: number; sign?: boolean } = {}): string {
  if (!isNum(v)) return "–";
  const sign = v < 0 ? "−" : opts.sign && v > 0 ? "+" : "";
  const a = Math.abs(v);
  let body: string;
  if (a >= 1_000_000) {
    const d = opts.digits ?? (a >= 10_000_000 ? 1 : 2);
    body = `${trimZeros((a / 1_000_000).toFixed(d))}M`;
  } else if (a >= 1_000) {
    const d = opts.digits ?? (a >= 100_000 ? 0 : a >= 10_000 ? 0 : 1);
    body = `${trimZeros((a / 1_000).toFixed(d))}k`;
  } else {
    body = `${Math.round(a)}`;
  }
  return `${sign}€${body}`;
}

/** Full EUR with thousands separators: €48,000. */
export function eurFull(v: number | null | undefined): string {
  if (!isNum(v)) return "–";
  const s = Math.round(Math.abs(v)).toLocaleString("en-US");
  return `${v < 0 ? "−" : ""}€${s}`;
}

/** Ratio to percent: 0.612 -> "61%", digits configurable. */
export function pct(v: number | null | undefined, digits = 0, opts: { sign?: boolean } = {}): string {
  if (!isNum(v)) return "–";
  const x = v * 100;
  const sign = x < 0 ? "−" : opts.sign && x > 0 ? "+" : "";
  return `${sign}${Math.abs(x).toFixed(digits)}%`;
}

/** Percentage-point delta between two ratios: +12 pp. */
export function pp(v: number | null | undefined, digits = 0): string {
  if (!isNum(v)) return "–";
  const x = v * 100;
  const sign = x < 0 ? "−" : x > 0 ? "+" : "±";
  return `${sign}${Math.abs(x).toFixed(digits)} pp`;
}

export function num(v: number | null | undefined, digits = 0): string {
  if (!isNum(v)) return "–";
  return v.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-09" -> "Sep 2026" (or "Sep 26" short). */
export function monthLabel(m: string | null | undefined, short = false): string {
  if (!m) return "–";
  const [y, mm] = m.split("-");
  const idx = Number(mm) - 1;
  if (!y || !(idx >= 0 && idx < 12)) return m;
  return short ? `${MONTHS[idx]} ${y.slice(2)}` : `${MONTHS[idx]} ${y}`;
}

/** "2026-09-30" -> "30 Sep 2026" (or "30 Sep" short). */
export function dateLabel(d: string | null | undefined, short = false): string {
  if (!d) return "–";
  const [y, mm, dd] = d.slice(0, 10).split("-");
  const idx = Number(mm) - 1;
  if (!y || !dd || !(idx >= 0 && idx < 12)) return d;
  return short ? `${Number(dd)} ${MONTHS[idx]}` : `${Number(dd)} ${MONTHS[idx]} ${y}`;
}

/** Days between two ISO dates (b - a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b.slice(0, 10)) - Date.parse(a.slice(0, 10))) / 86_400_000);
}

/** Retention / probability values may arrive as 0..1 or 0..100; normalise to 0..1. */
export function asRatio(v: number): number {
  return Math.abs(v) > 2 ? v / 100 : v;
}

/** Axis tick formatter for EUR (no decimals unless needed). */
export function eurTick(v: number): string {
  if (!isNum(v)) return "";
  const a = Math.abs(v);
  const sign = v < 0 ? "−" : "";
  if (a >= 1_000_000) return `${sign}€${trimZeros((a / 1_000_000).toFixed(1))}M`;
  if (a >= 1_000) return `${sign}€${Math.round(a / 1_000)}k`;
  return `${sign}€${a}`;
}
