import raw from "@/data/forecast.json";
import type { ForecastData } from "@/lib/types";

/**
 * The single entry point to the pipeline output. The JSON is imported statically,
 * so swapping web/src/data/forecast.json and rebuilding is all it takes.
 * Cast through unknown: TS infers literal/narrow types from JSON (e.g. never[] for
 * an empty array), which would otherwise fight the contract types.
 */
export const data = raw as unknown as ForecastData;

/** Optional AI brief the pipeline may add beside the contract (string or null). */
export function pipelineBrief(): string | null {
  const b = (raw as Record<string, unknown>).brief;
  if (typeof b === "string" && b.trim()) return b;
  if (b && typeof b === "object" && typeof (b as { markdown?: unknown }).markdown === "string") {
    return (b as { markdown: string }).markdown;
  }
  return null;
}

/** "2026-09-30" -> "2026-09" */
export const asOfMonth = (d: ForecastData = data) => d.meta.asOf.slice(0, 7);
