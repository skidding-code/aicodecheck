import { useState } from "react";
import type { AnalysisResult } from "@aicodecheck/detector-core";
import { Header } from "./components/Header";
import { DisclaimerBanner } from "./components/DisclaimerBanner";
import { InputPanel, type AnalyzeRequest } from "./components/InputPanel";
import { Results } from "./components/Results";
import { About } from "./components/About";
import { analyzeSnippet, analyzeFiles } from "./lib/engineClient";

interface Analysis {
  result: AnalysisResult;
  note?: string;
  skipped?: string[];
}

export default function App() {
  const [view, setView] = useState<"analyze" | "about">("analyze");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);

  async function handleAnalyze(req: AnalyzeRequest) {
    setError(null);
    setBusy(true);
    try {
      const result =
        req.kind === "snippet"
          ? await analyzeSnippet(req.code ?? "", {
              filename: req.filename,
              language: req.language,
            })
          : await analyzeFiles(req.files ?? {});
      setAnalysis({
        result,
        note: req.note ? `${req.label} — ${req.note}` : req.label,
        skipped: req.skipped,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-full">
      <DisclaimerBanner />
      <Header view={view} onView={setView} />

      <main className="mx-auto max-w-6xl px-4 py-6">
        {view === "about" ? (
          <About />
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,420px)_1fr]">
            <div className="space-y-4">
              <InputPanel busy={busy} onAnalyze={handleAnalyze} onError={setError} />
              {error ? (
                <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-200">
                  {error}
                </div>
              ) : null}
              {busy ? (
                <div className="flex items-center gap-3 rounded-lg border border-ink-700 bg-ink-900 p-3 text-sm text-slate-300">
                  <span className="h-3 w-3 animate-ping rounded-full bg-brand-500" />
                  Running analysis in a Web Worker…
                </div>
              ) : null}
            </div>

            <div>
              {analysis ? (
                <Results
                  result={analysis.result}
                  note={analysis.note}
                  skipped={analysis.skipped}
                />
              ) : (
                <EmptyState />
              )}
            </div>
          </div>
        )}
      </main>

      <footer className="border-t border-ink-700 px-4 py-6 text-center text-xs text-slate-600">
        Backend-free · all analysis runs locally in your browser · results are
        probabilistic estimates, never proof.
      </footer>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="grid h-full min-h-[320px] place-items-center rounded-xl border border-dashed border-ink-700 bg-ink-900/40 p-8 text-center">
      <div>
        <h2 className="text-lg font-semibold text-slate-200">No analysis yet</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-slate-400">
          Paste a snippet, choose files, drop a folder, upload a ZIP, or fetch a
          public GitHub repo. Everything is analyzed locally — your code never
          leaves this browser tab.
        </p>
      </div>
    </div>
  );
}
