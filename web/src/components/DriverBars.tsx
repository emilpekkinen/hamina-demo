import type { Driver } from "@/lib/types";
import { C } from "@/lib/chart";
import { Empty, Legend } from "./ui";

/**
 * Odds-ratio bars on a log scale centred on 1 (no effect).
 * Risk drivers extend left (pink), protective drivers right (blue).
 */
export function DriverBars({ drivers, outcome }: { drivers: Driver[]; outcome: string }) {
  if (!drivers.length) return <Empty>No drivers reported.</Empty>;
  const sorted = [...drivers].sort((a, b) => Math.log(b.oddsRatio) - Math.log(a.oddsRatio));
  const maxLog = Math.max(...sorted.map((d) => Math.abs(Math.log(Math.max(d.oddsRatio, 1e-3)))), Math.log(2));
  return (
    <div>
      <Legend
        className="mb-3"
        items={[
          { label: `Lowers ${outcome} odds (risk)`, color: C.pink },
          { label: `Raises ${outcome} odds (protective)`, color: C.blue },
        ]}
      />
      <ul className="space-y-1.5">
        {sorted.map((d) => {
          const l = Math.log(Math.max(d.oddsRatio, 1e-3));
          const w = (Math.abs(l) / maxLog) * 38;
          const protective = d.direction ? d.direction === "protective" : l > 0;
          const color = protective ? C.blue : C.pink;
          return (
            <li
              key={d.feature}
              className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center gap-3"
              title={`${d.label}: odds ratio ${d.oddsRatio.toFixed(2)}`}
            >
              <span className="line-clamp-2 text-[13px] leading-4 text-gray-700">{d.label}</span>
              <span className="relative h-5">
                <span className="absolute inset-y-0 left-1/2 w-px bg-gray-300" aria-hidden />
                <span
                  className="absolute top-1/2 h-3 -translate-y-1/2 rounded-[3px]"
                  style={{
                    background: color,
                    width: `${w}%`,
                    left: l >= 0 ? "50%" : `${50 - w}%`,
                  }}
                />
                <span
                  className="absolute top-1/2 -translate-y-1/2 text-[11px] font-semibold tabular text-gray-900"
                  style={l >= 0 ? { left: `calc(${50 + w}% + 4px)` } : { right: `calc(${50 + w}% + 4px)` }}
                >
                  {d.oddsRatio.toFixed(2)}×
                </span>
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-[11px] text-gray-500">Odds ratio, log scale. 1.0× = no effect.</p>
    </div>
  );
}
