import { useEffect, useState } from "react";
import { api } from "../api";
import type { DetectorInfo } from "../types";
import { Card, EmptyState, ErrorBanner, Spinner } from "../components/ui";

export function DetectorsPage() {
  const [detectors, setDetectors] = useState<DetectorInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getDetectors()
      .then(setDetectors)
      .catch((e) => setError((e as Error).message));
  }, []);

  return (
    <Card title="Detectors">
      <p className="mb-4 text-sm text-slate-400">
        Each detector contributes weighted signals to the overall estimate. No
        single detector is conclusive.
      </p>
      {error ? (
        <ErrorBanner message={error} />
      ) : detectors === null ? (
        <Spinner label="Loading detectors…" />
      ) : detectors.length === 0 ? (
        <EmptyState>No detectors reported.</EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {detectors.map((d) => (
            <div
              key={d.name}
              className="rounded-lg border border-ink-700 bg-ink-900/50 p-4"
            >
              <div className="font-medium text-slate-100">{d.name}</div>
              <p className="mt-1 text-sm text-slate-400">{d.description}</p>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
