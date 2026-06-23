import { useState } from "react";
import { Header, type TabKey } from "./components/Header";
import { DisclaimerBanner } from "./components/DisclaimerBanner";
import { AnalyzePage } from "./pages/AnalyzePage";
import { HistoryPage } from "./pages/HistoryPage";
import { DetectorsPage } from "./pages/DetectorsPage";
import { AboutPage } from "./pages/AboutPage";
import type { AnalysisResult } from "./types";

export default function App() {
  const [tab, setTab] = useState<TabKey>("analyze");
  const [result, setResult] = useState<AnalysisResult | null>(null);

  function handleResult(r: AnalysisResult) {
    setResult(r);
    setTab("analyze");
  }

  return (
    <div className="flex min-h-full flex-col">
      <DisclaimerBanner />
      <Header active={tab} onChange={setTab} />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">
        {tab === "analyze" && (
          <AnalyzePage result={result} onResult={handleResult} />
        )}
        {tab === "history" && <HistoryPage onOpen={handleResult} />}
        {tab === "detectors" && <DetectorsPage />}
        {tab === "about" && <AboutPage />}
      </main>
      <footer className="border-t border-ink-700 px-4 py-4 text-center text-xs text-slate-600">
        AI Project Detector · estimates are probabilistic, never proof.
      </footer>
    </div>
  );
}
