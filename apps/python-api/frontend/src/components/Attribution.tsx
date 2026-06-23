import type { AnalysisResult } from "../types";
import { Card, EmptyState, Meter } from "./ui";
import { pct } from "../lib/format";

export function AttributionPanel({ result }: { result: AnalysisResult }) {
  const items = (result.attribution ?? [])
    .slice()
    .sort((a, b) => b.probability - a.probability);

  return (
    <Card title="Model / source attribution">
      <div className="mb-4 rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
        <strong className="font-semibold">Experimental — not fact.</strong>{" "}
        Attribution to a specific model or source is highly speculative and
        low-confidence. These guesses can easily be wrong and must never be
        treated as evidence of authorship.
      </div>
      {items.length === 0 ? (
        <EmptyState>No attribution estimates.</EmptyState>
      ) : (
        <ul className="space-y-3">
          {items.map((a, i) => (
            <li key={i} className="rounded-lg border border-ink-700 bg-ink-900/50 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium text-slate-200">{a.source}</span>
                <span className="font-mono text-xs text-slate-400">{pct(a.probability)}</span>
              </div>
              <Meter label="Likelihood" value={a.probability} color="bg-fuchsia-500" />
              {a.rationale && (
                <p className="mt-2 text-xs text-slate-400">{a.rationale}</p>
              )}
              {a.confidence != null && (
                <p className="mt-1 text-[11px] text-slate-500">
                  confidence {pct(a.confidence)}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
