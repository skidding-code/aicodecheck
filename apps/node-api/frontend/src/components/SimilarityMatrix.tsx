import type { AnalysisResult } from "../types";
import { Card, EmptyState } from "./ui";

export function SimilarityMatrixView({ result }: { result: AnalysisResult }) {
  const sim = result.visualizations?.similarity_matrix;
  const labels = sim?.labels ?? [];
  const matrix = sim?.matrix ?? [];

  return (
    <Card title="Similarity matrix">
      {labels.length === 0 || matrix.length === 0 ? (
        <EmptyState>No similarity data.</EmptyState>
      ) : (
        <div className="overflow-auto">
          <table className="border-separate border-spacing-0.5 text-[10px]">
            <tbody>
              <tr>
                <td className="p-1" />
                {labels.map((l, i) => (
                  <td
                    key={i}
                    className="max-w-[60px] truncate p-1 text-slate-500"
                    title={l}
                  >
                    {short(l)}
                  </td>
                ))}
              </tr>
              {matrix.map((row, r) => (
                <tr key={r}>
                  <td
                    className="max-w-[120px] truncate p-1 text-right font-mono text-slate-400"
                    title={labels[r]}
                  >
                    {short(labels[r])}
                  </td>
                  {row.map((v, c) => (
                    <td
                      key={c}
                      title={`${labels[r]} ↔ ${labels[c]}: ${v.toFixed(2)}`}
                      className="h-6 w-6 rounded-sm text-center font-mono"
                      style={{
                        background: cellColor(v),
                        color: v > 0.6 ? "#0b1020" : "#94a3b8",
                      }}
                    >
                      {v >= 0.99 ? "" : v.toFixed(1).replace(/^0/, "")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-xs text-slate-500">
            Brighter cells indicate higher structural similarity between files.
          </p>
        </div>
      )}
    </Card>
  );
}

function cellColor(v: number): string {
  const a = Math.max(0, Math.min(1, v));
  return `rgba(77, 139, 255, ${0.1 + a * 0.85})`;
}

function short(l: string): string {
  if (!l) return "";
  const parts = l.split("/");
  return parts[parts.length - 1];
}
