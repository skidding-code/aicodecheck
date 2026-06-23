import type { AnalysisResult } from "@aicodecheck/detector-core";
import { Headline } from "./Headline";
import { ClassificationPie, SignalBreakdown } from "./Charts";
import { FileHeatmap, FolderHeatmap } from "./Heatmaps";
import { SimilarityMatrix } from "./SimilarityMatrix";
import { DependencyGraph } from "./DependencyGraph";
import { Reasons, Evidence } from "./ReasonsEvidence";
import { Attribution, Recommendations } from "./Attribution";
import { Card } from "./ui";

export function Results({
  result,
  note,
  skipped,
}: {
  result: AnalysisResult;
  note?: string;
  skipped?: string[];
}) {
  return (
    <div className="space-y-5">
      <Headline result={result} />

      {(note || (skipped && skipped.length) || result.warnings.length) && (
        <Card title="Notes">
          {note ? <p className="text-sm text-slate-300">{note}</p> : null}
          {result.warnings.map((w, i) => (
            <p key={i} className="mt-1 text-sm text-amber-300">
              ⚠ {w}
            </p>
          ))}
          {!result.commit_analysis.available && result.target.total_files > 1 ? (
            <p className="mt-1 text-xs text-slate-500">
              Git history is unavailable in the browser, so commit-timeline and
              contributor signals are not included. This is expected for the
              backend-free edition.
            </p>
          ) : null}
          {skipped && skipped.length ? (
            <details className="mt-2 text-xs text-slate-500">
              <summary className="cursor-pointer">
                {skipped.length} item(s) skipped
              </summary>
              <ul className="mt-1 max-h-40 space-y-0.5 overflow-auto font-mono">
                {skipped.slice(0, 200).map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </details>
          ) : null}
        </Card>
      )}

      <Reasons result={result} />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <ClassificationPie result={result} />
        <SignalBreakdown result={result} />
      </div>

      <FolderHeatmap result={result} />
      <FileHeatmap result={result} />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <SimilarityMatrix result={result} />
        <DependencyGraph result={result} />
      </div>

      <Evidence result={result} />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Attribution result={result} />
        <Recommendations result={result} />
      </div>

      <Card title="Disclaimer">
        <p className="text-xs leading-relaxed text-slate-400">{result.disclaimer}</p>
        <p className="mt-2 text-[11px] text-slate-600">
          Engine v{result.engine_version} · generated {result.generated_at}
        </p>
      </Card>
    </div>
  );
}
