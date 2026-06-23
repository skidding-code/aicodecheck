import type { AnalysisResult } from "../types";
import { Card, EmptyState } from "./ui";
import { classificationLabel, pct, probabilityColor } from "../lib/format";

export function FolderHeatmap({ result }: { result: AnalysisResult }) {
  const rows = (result.visualizations?.folder_heatmap ?? [])
    .slice()
    .sort((a, b) => b.ai_probability - a.ai_probability);

  return (
    <Card title="Folder heatmap">
      {rows.length === 0 ? (
        <EmptyState>No folder-level data.</EmptyState>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => {
            const depth = r.path === "." ? 0 : r.path.split("/").length;
            return (
              <div
                key={r.path}
                className="flex items-center gap-3 rounded-lg border border-ink-700 bg-ink-900/50 px-3 py-2"
                style={{ marginLeft: Math.min(depth, 6) * 12 }}
              >
                <span
                  className="inline-block h-4 w-4 shrink-0 rounded"
                  style={{ background: probabilityColor(r.ai_probability) }}
                />
                <span className="flex-1 truncate font-mono text-xs text-slate-300" title={r.path}>
                  {r.path === "." ? "/ (root)" : r.path}
                </span>
                <span className="text-xs text-slate-500">{r.files} files</span>
                <span className="text-xs text-slate-400">{classificationLabel(r.classification)}</span>
                <span className="w-12 text-right font-mono text-xs text-slate-200">
                  {pct(r.ai_probability)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
