import type { AnalysisResult } from "../types";
import { Card, EmptyState } from "./ui";

export function Recommendations({ result }: { result: AnalysisResult }) {
  const recs = result.recommendations ?? [];
  const warnings = result.warnings ?? [];

  return (
    <Card title="Recommendations">
      {warnings.length > 0 && (
        <ul className="mb-4 space-y-2">
          {warnings.map((w, i) => (
            <li
              key={i}
              className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200"
            >
              ⚠ {w}
            </li>
          ))}
        </ul>
      )}
      {recs.length === 0 ? (
        <EmptyState>No recommendations.</EmptyState>
      ) : (
        <ul className="space-y-2">
          {recs.map((r, i) => (
            <li key={i} className="flex gap-3 text-sm text-slate-300">
              <span className="mt-0.5 text-emerald-400">✓</span>
              <span>{r}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
