import type { ForecastData } from "@/lib/types";
import { SCORE_RAMP, scoreColor, textOn } from "@/lib/chart";
import { asRatio, eur, num } from "@/lib/format";
import { Empty, th } from "./ui";

export function CohortHeatmap({ cohorts }: { cohorts: ForecastData["cohorts"] }) {
  if (!cohorts.length) return <Empty>No cohort data in this snapshot.</Empty>;
  const cols = Math.max(...cohorts.map((c) => c.retention.length));
  return (
    <div>
      <div className="overflow-x-auto rounded-lg border border-gray-100">
        <table className="w-full border-separate border-spacing-0.5 text-xs">
          <thead>
            <tr>
              <th className={`${th} sticky left-0 z-10`}>Cohort</th>
              <th className={`${th} text-right`}>Cust.</th>
              <th className={`${th} text-right`}>Start MRR</th>
              {Array.from({ length: cols }, (_, i) => (
                <th key={i} className={`${th} px-1 text-center`}>
                  Q{i}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cohorts.map((c) => (
              <tr key={c.cohort}>
                <td className="sticky left-0 z-10 whitespace-nowrap bg-white px-3 py-1 font-medium text-gray-900">
                  {c.cohort}
                </td>
                <td className="px-2 py-1 text-right tabular text-gray-600">{num(c.customers)}</td>
                <td className="px-2 py-1 text-right tabular text-gray-600">{eur(c.startMrr)}</td>
                {Array.from({ length: cols }, (_, i) => {
                  const raw = c.retention[i];
                  if (raw == null) return <td key={i} className="min-w-11 rounded-[4px] bg-gray-50" />;
                  const v = asRatio(raw);
                  const bg = scoreColor(v);
                  return (
                    <td
                      key={i}
                      title={`${c.cohort} · quarter ${i}: ${Math.round(v * 100)}% of starting MRR retained`}
                      className="min-w-11 rounded-[4px] px-1 py-1.5 text-center font-medium tabular"
                      style={{ background: bg, color: textOn(bg) }}
                    >
                      {Math.round(v * 100)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-gray-600">
        <span className="text-gray-500">MRR retained (%), quarters since start:</span>
        {[...SCORE_RAMP].reverse().map((s) => (
          <span key={s.label} className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-[3px]" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}
