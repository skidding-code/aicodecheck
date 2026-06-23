import type { AnalysisResult, Evidence } from "../types";
import { Card, EmptyState } from "./ui";
import { severityRank } from "../lib/format";

export function TopReasons({ result }: { result: AnalysisResult }) {
  const reasons = result.reasons ?? result.score?.reasons ?? [];
  return (
    <Card title="Top reasons">
      {reasons.length === 0 ? (
        <EmptyState>No summary reasons provided.</EmptyState>
      ) : (
        <ul className="space-y-2">
          {reasons.map((r, i) => (
            <li key={i} className="flex gap-3 text-sm text-slate-300">
              <span className="mt-0.5 text-brand-400">›</span>
              <span>{r}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function severityBadge(sev: Evidence["severity"]) {
  const rank = severityRank(sev);
  const label =
    typeof sev === "string" ? sev : ["info", "low", "medium", "high", "critical"][rank] ?? "info";
  const cls =
    rank >= 4
      ? "bg-rose-500/20 text-rose-300"
      : rank === 3
        ? "bg-orange-500/20 text-orange-300"
        : rank === 2
          ? "bg-amber-500/20 text-amber-300"
          : rank === 1
            ? "bg-sky-500/20 text-sky-300"
            : "bg-slate-500/20 text-slate-300";
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${cls}`}>
      {label}
    </span>
  );
}

export function EvidencePanel({ result }: { result: AnalysisResult }) {
  const evidence = (result.evidence ?? [])
    .slice()
    .sort((a, b) => severityRank(b.severity) - severityRank(a.severity));

  return (
    <Card title="Evidence">
      {evidence.length === 0 ? (
        <EmptyState>No detailed evidence items.</EmptyState>
      ) : (
        <ul className="max-h-[28rem] space-y-3 overflow-auto pr-1">
          {evidence.map((e, i) => (
            <li
              key={i}
              className="rounded-lg border border-ink-700 bg-ink-900/60 p-3"
            >
              <div className="mb-1 flex flex-wrap items-center gap-2">
                {severityBadge(e.severity)}
                <span className="text-xs font-medium text-slate-300">
                  {e.detector}
                  {e.signal ? ` · ${e.signal}` : ""}
                </span>
                {e.path && (
                  <span className="font-mono text-[11px] text-slate-500">
                    {e.path}
                    {e.start_line != null ? `:${e.start_line}` : ""}
                  </span>
                )}
              </div>
              <p className="text-sm text-slate-300">{e.message}</p>
              {e.snippet && (
                <pre className="mt-2 overflow-auto rounded bg-ink-950/80 p-2 font-mono text-[11px] text-slate-400">
                  {e.snippet}
                </pre>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
