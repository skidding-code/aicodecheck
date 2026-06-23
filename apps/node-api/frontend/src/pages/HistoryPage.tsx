import { useEffect, useState } from "react";
import { api } from "../api";
import type { AnalysisResult, HistoryItem } from "../types";
import { Card, ClassificationChip, EmptyState, ErrorBanner, Spinner } from "../components/ui";
import { formatDate, pct } from "../lib/format";

export function HistoryPage({
  onOpen,
}: {
  onOpen: (r: AnalysisResult) => void;
}) {
  const [items, setItems] = useState<HistoryItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  function load() {
    setError(null);
    setItems(null);
    api
      .getHistory()
      .then(setItems)
      .catch((e) => setError((e as Error).message));
  }

  useEffect(load, []);

  function open(id: string) {
    setLoadingId(id);
    setError(null);
    api
      .getReport(id)
      .then((r) => onOpen(r))
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoadingId(null));
  }

  return (
    <Card
      title="Analysis history"
      actions={
        <button className="btn-ghost" onClick={load}>
          Refresh
        </button>
      }
    >
      {error && (
        <div className="mb-4">
          <ErrorBanner message={error} />
        </div>
      )}
      {items === null && !error ? (
        <Spinner label="Loading history…" />
      ) : items && items.length === 0 ? (
        <EmptyState>No prior analyses yet.</EmptyState>
      ) : (
        items && (
          <div className="overflow-auto rounded-lg border border-ink-700">
            <table className="w-full text-left text-sm">
              <thead className="bg-ink-850 text-xs uppercase text-slate-400">
                <tr>
                  <th className="px-3 py-2">Target</th>
                  <th className="px-3 py-2">Kind</th>
                  <th className="px-3 py-2">Classification</th>
                  <th className="px-3 py-2 text-right">AI</th>
                  <th className="px-3 py-2 text-right">Conf</th>
                  <th className="px-3 py-2">Created</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id} className="border-t border-ink-700/60 hover:bg-ink-800">
                    <td className="px-3 py-2 font-medium text-slate-200">{it.target_name}</td>
                    <td className="px-3 py-2 text-slate-400">{it.kind}</td>
                    <td className="px-3 py-2">
                      <ClassificationChip value={it.classification} />
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{pct(it.ai_probability)}</td>
                    <td className="px-3 py-2 text-right font-mono text-slate-400">{pct(it.confidence)}</td>
                    <td className="px-3 py-2 text-xs text-slate-500">{formatDate(it.created_at)}</td>
                    <td className="px-3 py-2 text-right">
                      <button
                        className="btn-primary px-3 py-1 text-xs"
                        onClick={() => open(it.id)}
                        disabled={loadingId === it.id}
                      >
                        {loadingId === it.id ? "Loading…" : "Open"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </Card>
  );
}
