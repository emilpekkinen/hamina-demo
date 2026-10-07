import { eur } from "@/lib/format";

/**
 * Horizontal meter: actual-to-date fill, P10–P90 band and P50 tick, with a plan marker.
 * All positions are relative to max(plan, p90) * 1.04.
 */
export function BandMeter({
  actual,
  p10,
  p50,
  p90,
  plan,
}: {
  actual: number;
  p10: number;
  p50: number;
  p90: number;
  plan?: number;
}) {
  const max = Math.max(plan ?? 0, p90, actual, 1) * 1.04;
  const pos = (v: number) => `${Math.max(0, Math.min(100, (v / max) * 100))}%`;
  return (
    <div>
      <div className="relative h-2.5 rounded-full bg-indigo-50" role="img" aria-label={`Actual ${eur(actual)}, forecast ${eur(p50)} (P10 ${eur(p10)} to P90 ${eur(p90)})${plan ? `, plan ${eur(plan)}` : ""}`}>
        <div className="absolute inset-y-0 left-0 rounded-full bg-blue-500" style={{ width: pos(actual) }} />
        <div
          className="absolute inset-y-0 rounded-full bg-indigo-200/80"
          style={{ left: pos(Math.max(p10, actual)), width: `calc(${pos(p90)} - ${pos(Math.max(p10, actual))})` }}
        />
        <div className="absolute -inset-y-0.5 w-0.5 rounded-full bg-indigo-700" style={{ left: pos(p50) }} />
        {plan != null && (
          <div className="absolute -inset-y-1.5 w-0.5 rounded-full bg-gray-900" style={{ left: pos(plan) }} />
        )}
      </div>
      <div className="mt-2 flex flex-wrap justify-between gap-x-3 gap-y-0.5 text-[11px] text-gray-500">
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-[2px] bg-blue-500" aria-hidden /> YTD {eur(actual)}
        </span>
        {plan != null && (
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-0.5 rounded-full bg-gray-900" aria-hidden /> Plan {eur(plan)}
          </span>
        )}
      </div>
    </div>
  );
}
