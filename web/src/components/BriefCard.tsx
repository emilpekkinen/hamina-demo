"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { RefreshCw, Sparkles } from "lucide-react";
import { Card } from "./ui";

type State =
  | { status: "idle"; markdown: string | null }
  | { status: "loading"; markdown: string | null }
  | { status: "done"; markdown: string }
  | { status: "error"; markdown: string | null; error: string };

export function BriefCard({ initial, asOf }: { initial: string | null; asOf: string }) {
  const [state, setState] = useState<State>({ status: "idle", markdown: initial });

  async function generate() {
    setState((s) => ({ status: "loading", markdown: s.markdown }));
    try {
      const res = await fetch("/api/brief", { method: "POST" });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const json = (await res.json()) as { markdown?: unknown };
      if (typeof json.markdown !== "string") throw new Error("Unexpected response");
      setState({ status: "done", markdown: json.markdown });
    } catch (e) {
      setState((s) => ({
        status: "error",
        markdown: s.markdown,
        error: e instanceof Error ? e.message : "Something went wrong",
      }));
    }
  }

  const loading = state.status === "loading";
  const md = state.markdown;

  return (
    <Card className="flex flex-col">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-500">
            <Sparkles size={18} strokeWidth={1.5} aria-hidden />
          </span>
          <div>
            <h2 className="text-base font-semibold leading-6 text-gray-900">AI weekly brief</h2>
            <p className="text-[13px] leading-5 text-gray-500">
              What changed, what to act on. Generated from the forecast snapshot of {asOf}.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={generate}
          disabled={loading}
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md bg-blue-500 px-3 text-xs font-medium text-white shadow-sm transition-colors duration-150 hover:bg-[#1A2CCC] active:bg-[#14229E] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-60"
        >
          {loading ? (
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" aria-hidden />
          ) : md ? (
            <RefreshCw size={14} strokeWidth={2} aria-hidden />
          ) : (
            <Sparkles size={14} strokeWidth={2} aria-hidden />
          )}
          {loading ? "Generating…" : md ? "Regenerate" : "Generate brief"}
        </button>
      </div>

      {state.status === "error" && (
        <div role="alert" className="mb-3 rounded-lg bg-error-bg px-3 py-2 text-xs text-error">
          Couldn’t generate the brief: {state.error}. Try again in a moment.
        </div>
      )}

      <div
        aria-live="polite"
        aria-busy={loading}
        className={`min-h-40 flex-1 rounded-lg border border-gray-100 bg-gray-50 p-4 transition-opacity ${loading && md ? "opacity-50" : ""}`}
      >
        {md ? (
          <div className="hm-prose text-sm leading-6 text-gray-700">
            <ReactMarkdown>{md}</ReactMarkdown>
          </div>
        ) : loading ? (
          <div className="space-y-2.5" aria-label="Loading brief">
            {[92, 80, 86, 60].map((w) => (
              <div key={w} className="h-3 animate-pulse rounded bg-gray-200/70" style={{ width: `${w}%` }} />
            ))}
          </div>
        ) : (
          <div className="flex h-full min-h-32 flex-col items-center justify-center text-center">
            <p className="text-sm font-medium text-gray-700">No brief yet</p>
            <p className="mt-1 max-w-xs text-xs leading-5 text-gray-500">
              Generate a short summary of forecast movements, at-risk renewals and deals that need attention.
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}
