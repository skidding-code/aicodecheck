import type { AnalysisResult } from "@aicodecheck/detector-core";
import { Card } from "./ui";
import { heatColor } from "../lib/format";

export function Reasons({ result }: { result: AnalysisResult }) {
  if (!result.reasons.length) {
    return null;
  }
  return (
    <Card title="Top reasons">
      <ul className="space-y-2">
        {result.reasons.map((r, i) => (
          <li key={i} className="flex gap-2 text-sm text-slate-200">
            <span className="mt-0.5 text-brand-400">•</span>
            <span>{r}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function Evidence({ result }: { result: AnalysisResult }) {
  const items = result.evidence.slice(0, 60);
  if (!items.length) {
    return (
      <Card title="Evidence">
        <p className="text-sm text-slate-500">
          No concrete line-level evidence was extracted. With low evidence, treat the
          verdict as little more than a guess.
        </p>
      </Card>
    );
  }
  return (
    <Card title={`Evidence (${result.evidence.length})`}>
      <div className="max-h-[28rem] space-y-3 overflow-auto pr-1">
        {items.map((e, i) => (
          <div key={i} className="rounded-lg border border-ink-700 bg-ink-900 p-3">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ background: heatColor(e.severity) }}
                title={`severity ${e.severity.toFixed(2)}`}
              />
              <span className="font-medium text-slate-300">{e.detector}</span>
              <span className="text-slate-500">·</span>
              <span className="text-slate-400">{e.signal}</span>
              {e.path ? (
                <span className="ml-auto font-mono text-[11px] text-slate-500">
                  {e.path}
                  {e.start_line != null ? `:${e.start_line}` : ""}
                  {e.end_line != null && e.end_line !== e.start_line
                    ? `-${e.end_line}`
                    : ""}
                </span>
              ) : null}
            </div>
            <p className="mt-1.5 text-sm text-slate-200">{e.message}</p>
            {e.snippet ? (
              <pre className="mt-2 overflow-auto rounded bg-ink-950 p-2 font-mono text-[11px] leading-relaxed text-slate-300">
                {e.snippet}
              </pre>
            ) : null}
          </div>
        ))}
      </div>
    </Card>
  );
}
