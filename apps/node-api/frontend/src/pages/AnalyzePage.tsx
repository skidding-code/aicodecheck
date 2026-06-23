import type { AnalysisResult } from "../types";
import { InputPanel } from "../components/InputPanel";
import { Results } from "../components/Results";
import { EmptyState } from "../components/ui";

export function AnalyzePage({
  result,
  onResult,
}: {
  result: AnalysisResult | null;
  onResult: (r: AnalysisResult) => void;
}) {
  return (
    <div className="space-y-6">
      <InputPanel onResult={onResult} />
      {result ? (
        <Results result={result} />
      ) : (
        <EmptyState>
          Choose an input type above and run an analysis to see the dashboard.
        </EmptyState>
      )}
    </div>
  );
}
