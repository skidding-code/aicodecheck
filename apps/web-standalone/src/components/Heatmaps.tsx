import type { AnalysisResult } from "@aicodecheck/detector-core";
import { Card } from "./ui";
import { pct, heatColor, CLASSIFICATION_LABEL } from "../lib/format";
import type { Classification } from "@aicodecheck/detector-core";

interface FileRow {
  path: string;
  ai_probability: number;
  confidence: number;
  classification: Classification;
  loc: number;
  language: string;
}

export function FileHeatmap({ result }: { result: AnalysisResult }) {
  const rows = (result.visualizations.file_heatmap as unknown as FileRow[])
    .slice()
    .sort((a, b) => b.ai_probability - a.ai_probability);

  if (!rows.length) {
    return (
      <Card title="File heatmap">
        <p className="text-sm text-slate-500">No per-file data (single snippet).</p>
      </Card>
    );
  }

  return (
    <Card title={`File heatmap (${rows.length} files)`}>
      <div className="max-h-80 overflow-auto rounded-lg border border-ink-700">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 bg-ink-800 text-slate-400">
            <tr>
              <th className="px-3 py-2 font-medium">File</th>
              <th className="px-3 py-2 font-medium">Lang</th>
              <th className="px-3 py-2 text-right font-medium">LOC</th>
              <th className="px-3 py-2 font-medium">AI prob</th>
              <th className="px-3 py-2 text-right font-medium">Conf</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.path} className="border-t border-ink-700/60">
                <td className="max-w-[280px] truncate px-3 py-1.5 font-mono text-slate-200" title={r.path}>
                  {r.path}
                </td>
                <td className="px-3 py-1.5 text-slate-400">{r.language}</td>
                <td className="px-3 py-1.5 text-right text-slate-400">{r.loc}</td>
                <td className="px-3 py-1.5">
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-block h-3 w-10 rounded"
                      style={{ background: heatColor(r.ai_probability) }}
                    />
                    <span className="font-mono text-slate-200">{pct(r.ai_probability)}</span>
                  </div>
                </td>
                <td className="px-3 py-1.5 text-right font-mono text-slate-400">
                  {pct(r.confidence)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

interface FolderRow {
  path: string;
  ai_probability: number;
  confidence: number;
  classification: Classification;
  files: number;
}

export function FolderHeatmap({ result }: { result: AnalysisResult }) {
  const rows = (result.visualizations.folder_heatmap as unknown as FolderRow[])
    .slice()
    .sort((a, b) => b.ai_probability - a.ai_probability);

  if (!rows.length) {
    return null;
  }

  return (
    <Card title="Folder heatmap">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {rows.map((r) => (
          <div
            key={r.path}
            className="flex items-center justify-between gap-3 rounded-lg border border-ink-700 bg-ink-900 px-3 py-2"
          >
            <div className="min-w-0">
              <div className="truncate font-mono text-xs text-slate-200" title={r.path}>
                {r.path === "." ? "(root)" : r.path}
              </div>
              <div className="text-[11px] text-slate-500">
                {r.files} file{r.files === 1 ? "" : "s"} · {CLASSIFICATION_LABEL[r.classification]}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span
                className="inline-block h-6 w-6 rounded"
                style={{ background: heatColor(r.ai_probability) }}
                title={`${pct(r.ai_probability)} AI prob`}
              />
              <span className="font-mono text-sm text-slate-200">{pct(r.ai_probability)}</span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
