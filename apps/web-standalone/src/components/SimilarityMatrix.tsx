import type { AnalysisResult } from "@aicodecheck/detector-core";
import { Card } from "./ui";

export function SimilarityMatrix({ result }: { result: AnalysisResult }) {
  const sim = result.visualizations.similarity_matrix as {
    labels?: string[];
    matrix?: number[][];
  };
  const labels = sim.labels ?? [];
  const matrix = sim.matrix ?? [];

  if (labels.length < 2) {
    return null;
  }

  // Color: white-ish for high similarity, dark for low.
  const cell = (v: number) => {
    const a = Math.max(0, Math.min(1, v));
    return `rgba(109, 168, 254, ${0.12 + a * 0.8})`;
  };

  const short = (s: string) => {
    const base = s.split("/").pop() ?? s;
    return base.length > 16 ? base.slice(0, 15) + "…" : base;
  };

  return (
    <Card title="Cross-file similarity (higher = more alike)">
      <div className="overflow-auto">
        <table className="border-separate" style={{ borderSpacing: 2 }}>
          <thead>
            <tr>
              <th className="sticky left-0 bg-ink-850" />
              {labels.map((l) => (
                <th
                  key={l}
                  className="h-24 align-bottom text-[10px] text-slate-400"
                  title={l}
                >
                  <div className="rotate-180 [writing-mode:vertical-rl] py-1">
                    {short(l)}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.map((row, i) => (
              <tr key={labels[i]}>
                <th
                  className="sticky left-0 bg-ink-850 pr-2 text-right text-[10px] text-slate-400"
                  title={labels[i]}
                >
                  {short(labels[i])}
                </th>
                {row.map((v, j) => (
                  <td
                    key={j}
                    className="h-6 w-6 rounded text-center align-middle"
                    style={{ background: cell(v) }}
                    title={`${labels[i]} ↔ ${labels[j]}: ${v.toFixed(2)}`}
                  />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        Highly similar files can indicate templated or generated code, but legitimate
        boilerplate looks the same — interpret with caution.
      </p>
    </Card>
  );
}
