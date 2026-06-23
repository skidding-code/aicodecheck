import type { AnalysisResult } from "../types";
import { Headline } from "./Headline";
import { TopReasons, EvidencePanel } from "./ReasonsEvidence";
import {
  ClassificationPie,
  CommitTimeline,
  ContributorActivity,
  SignalBreakdown,
} from "./Charts";
import { FileHeatmap } from "./FileHeatmap";
import { FolderHeatmap } from "./FolderHeatmap";
import { SimilarityMatrixView } from "./SimilarityMatrix";
import { DependencyGraphView } from "./DependencyGraph";
import { AttributionPanel } from "./Attribution";
import { Recommendations } from "./Recommendations";
import { Card } from "./ui";
import { formatDate } from "../lib/format";

function downloadJson(result: AnalysisResult) {
  const blob = new Blob([JSON.stringify(result, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `analysis-${result.id ?? "report"}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function TargetSummary({ result }: { result: AnalysisResult }) {
  const t = result.target ?? ({} as AnalysisResult["target"]);
  const langs = Object.entries(t.languages ?? {}).sort((a, b) => b[1] - a[1]);
  const stats: [string, string | number | undefined][] = [
    ["Kind", t.kind],
    ["Files analyzed", t.analyzed_files],
    ["Total files", t.total_files],
    ["Skipped", t.skipped_files],
    ["Total LOC", t.total_loc],
    ["Engine", result.engine_version],
    ["Elapsed", result.elapsed_seconds != null ? `${result.elapsed_seconds.toFixed(2)}s` : undefined],
    ["Generated", formatDate(result.generated_at)],
  ];
  return (
    <Card title="Target">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats
          .filter(([, v]) => v != null && v !== "")
          .map(([k, v]) => (
            <div key={k}>
              <div className="text-[10px] uppercase tracking-wide text-slate-500">{k}</div>
              <div className="text-sm text-slate-200">{String(v)}</div>
            </div>
          ))}
      </div>
      {langs.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {langs.map(([lang, count]) => (
            <span
              key={lang}
              className="rounded-full border border-ink-600 bg-ink-900 px-2.5 py-1 text-xs text-slate-300"
            >
              {lang} · {count}
            </span>
          ))}
        </div>
      )}
    </Card>
  );
}

export function Results({ result }: { result: AnalysisResult }) {
  const commit = result.commit_analysis;
  const hasCommit = commit?.available;
  const hasContrib = result.contributor_analysis?.available;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Analysis results</h2>
        <button className="btn-ghost" onClick={() => downloadJson(result)}>
          ⬇ Download JSON
        </button>
      </div>

      <Headline result={result} />

      <TargetSummary result={result} />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <TopReasons result={result} />
        <EvidencePanel result={result} />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <ClassificationPie data={result.visualizations?.classification_pie} />
        <SignalBreakdown data={result.visualizations?.signal_breakdown} />
      </div>

      {(hasCommit || hasContrib) && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <CommitTimeline data={result.visualizations?.commit_timeline} />
          <ContributorActivity data={result.visualizations?.contributor_activity} />
        </div>
      )}

      <FileHeatmap result={result} />
      <FolderHeatmap result={result} />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <SimilarityMatrixView result={result} />
        <DependencyGraphView result={result} />
      </div>

      <AttributionPanel result={result} />
      <Recommendations result={result} />

      {result.disclaimer && (
        <p className="text-center text-xs text-slate-500">{result.disclaimer}</p>
      )}
    </div>
  );
}
