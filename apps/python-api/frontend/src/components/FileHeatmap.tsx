import { useMemo, useState } from "react";
import type { AnalysisResult, EntityAnalysis, FileHeatmapEntry } from "../types";
import { Card, ClassificationChip, EmptyState } from "./ui";
import { pct, probabilityColor } from "../lib/format";

type SortKey = "path" | "ai_probability" | "confidence" | "loc" | "risk";

export function FileHeatmap({ result }: { result: AnalysisResult }) {
  const rows = result.visualizations?.file_heatmap ?? [];
  const [sortKey, setSortKey] = useState<SortKey>("ai_probability");
  const [asc, setAsc] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  // Index file entities by path for the drill-down view.
  const byPath = useMemo(() => {
    const m = new Map<string, EntityAnalysis>();
    for (const f of result.files ?? []) {
      if (f.path) m.set(f.path, f);
    }
    return m;
  }, [result.files]);

  const riskOf = (p: string) => byPath.get(p)?.score?.risk_score ?? 0;

  const sorted = useMemo(() => {
    const arr = rows.slice();
    arr.sort((a, b) => {
      let av: number | string;
      let bv: number | string;
      if (sortKey === "path") {
        av = a.path;
        bv = b.path;
      } else if (sortKey === "risk") {
        av = riskOf(a.path);
        bv = riskOf(b.path);
      } else {
        av = a[sortKey] ?? 0;
        bv = b[sortKey] ?? 0;
      }
      if (av < bv) return asc ? -1 : 1;
      if (av > bv) return asc ? 1 : -1;
      return 0;
    });
    return arr;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, sortKey, asc, byPath]);

  function toggleSort(k: SortKey) {
    if (k === sortKey) setAsc((v) => !v);
    else {
      setSortKey(k);
      setAsc(k === "path");
    }
  }

  const selEntity = selected ? byPath.get(selected) : null;

  return (
    <Card title="File heatmap">
      {rows.length === 0 ? (
        <EmptyState>No per-file data.</EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr,1fr]">
          <div className="max-h-[28rem] overflow-auto rounded-lg border border-ink-700">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-ink-850 text-xs uppercase text-slate-400">
                <tr>
                  <Th label="File" k="path" sortKey={sortKey} asc={asc} onClick={toggleSort} />
                  <Th label="AI" k="ai_probability" sortKey={sortKey} asc={asc} onClick={toggleSort} align="right" />
                  <Th label="Conf" k="confidence" sortKey={sortKey} asc={asc} onClick={toggleSort} align="right" />
                  <Th label="Risk" k="risk" sortKey={sortKey} asc={asc} onClick={toggleSort} align="right" />
                  <Th label="LOC" k="loc" sortKey={sortKey} asc={asc} onClick={toggleSort} align="right" />
                </tr>
              </thead>
              <tbody>
                {sorted.map((r: FileHeatmapEntry) => (
                  <tr
                    key={r.path}
                    onClick={() => setSelected(r.path)}
                    className={`cursor-pointer border-t border-ink-700/60 hover:bg-ink-800 ${
                      selected === r.path ? "bg-ink-800" : ""
                    }`}
                  >
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span
                          className="inline-block h-3 w-3 shrink-0 rounded-sm"
                          style={{ background: probabilityColor(r.ai_probability) }}
                        />
                        <span className="truncate font-mono text-xs text-slate-300" title={r.path}>
                          {r.path}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs">{pct(r.ai_probability)}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs text-slate-400">{pct(r.confidence)}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs text-slate-400">{pct(riskOf(r.path))}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs text-slate-400">{r.loc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="rounded-lg border border-ink-700 bg-ink-900/50 p-4">
            {!selEntity ? (
              <p className="text-sm text-slate-500">
                Select a file to inspect its signals and reasons.
              </p>
            ) : (
              <div className="space-y-3">
                <div>
                  <div className="font-mono text-xs text-slate-400">{selEntity.path}</div>
                  <div className="mt-1 flex items-center gap-2">
                    <ClassificationChip value={selEntity.score?.classification} />
                    <span className="text-xs text-slate-400">
                      AI {pct(selEntity.score?.ai_probability)} · conf {pct(selEntity.score?.confidence)}
                    </span>
                  </div>
                </div>
                {selEntity.score?.reasons && selEntity.score.reasons.length > 0 && (
                  <ul className="space-y-1 text-xs text-slate-300">
                    {selEntity.score.reasons.map((r, i) => (
                      <li key={i}>• {r}</li>
                    ))}
                  </ul>
                )}
                <div>
                  <div className="mb-1 text-xs font-semibold uppercase text-slate-500">Signals</div>
                  {(selEntity.signals ?? []).length === 0 ? (
                    <p className="text-xs text-slate-500">No signals.</p>
                  ) : (
                    <ul className="max-h-64 space-y-2 overflow-auto">
                      {selEntity.signals.map((s, i) => (
                        <li key={i} className="rounded border border-ink-700 bg-ink-950/60 p-2">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-medium text-slate-200">{s.name}</span>
                            <span className="font-mono text-slate-400">{pct(s.score)}</span>
                          </div>
                          <div className="text-[11px] text-slate-500">{s.detector}</div>
                          {s.reason && <div className="mt-1 text-[11px] text-slate-400">{s.reason}</div>}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

function Th({
  label,
  k,
  sortKey,
  asc,
  onClick,
  align = "left",
}: {
  label: string;
  k: SortKey;
  sortKey: SortKey;
  asc: boolean;
  onClick: (k: SortKey) => void;
  align?: "left" | "right";
}) {
  return (
    <th
      onClick={() => onClick(k)}
      className={`cursor-pointer select-none px-3 py-2 font-semibold ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      {label}
      {sortKey === k && <span className="ml-1 text-slate-500">{asc ? "▲" : "▼"}</span>}
    </th>
  );
}
