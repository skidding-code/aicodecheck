import type { AnalysisResult } from "@aicodecheck/detector-core";
import { Card, Meter } from "./ui";
import { pct } from "../lib/format";

export function Attribution({ result }: { result: AnalysisResult }) {
  const guesses = result.attribution
    .slice()
    .sort((a, b) => b.probability - a.probability);

  return (
    <Card title="Attribution (highly speculative)">
      <div className="mb-3 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200">
        <strong>Do not treat any of this as fact.</strong> Source attribution is the
        weakest, most experimental part of the analysis. These are low-confidence guesses
        about which family of tools <em>might</em> produce similar-looking output — never
        a determination that a specific tool was used.
      </div>
      {guesses.length ? (
        <div className="space-y-3">
          {guesses.map((g) => (
            <div key={g.source}>
              <Meter
                label={`${g.source}  ·  conf ${pct(g.confidence)}`}
                value={g.probability}
                color="#a78bfa"
              />
              <p className="mt-1 text-xs text-slate-500">{g.rationale}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-slate-500">No attribution guesses were produced.</p>
      )}
    </Card>
  );
}

export function Recommendations({ result }: { result: AnalysisResult }) {
  if (!result.recommendations.length) {
    return null;
  }
  return (
    <Card title="Recommendations">
      <ul className="space-y-2">
        {result.recommendations.map((r, i) => (
          <li key={i} className="flex gap-2 text-sm text-slate-200">
            <span className="mt-0.5 text-emerald-400">✓</span>
            <span>{r}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
