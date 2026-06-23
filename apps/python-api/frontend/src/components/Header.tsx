export type TabKey = "analyze" | "history" | "detectors" | "about";

const TABS: { key: TabKey; label: string }[] = [
  { key: "analyze", label: "Analyze" },
  { key: "history", label: "History" },
  { key: "detectors", label: "Detectors" },
  { key: "about", label: "About" },
];

export function Header({
  active,
  onChange,
}: {
  active: TabKey;
  onChange: (t: TabKey) => void;
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-ink-700 bg-ink-950/80 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-brand-400 to-brand-600 font-bold text-white">
            AI
          </div>
          <div>
            <h1 className="text-lg font-semibold leading-tight">
              AI Project Detector
            </h1>
            <p className="text-xs text-slate-500">
              Probabilistic provenance analysis for code
            </p>
          </div>
        </div>
        <nav className="flex gap-1 rounded-lg border border-ink-700 bg-ink-850 p-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => onChange(t.key)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                active === t.key
                  ? "bg-brand-500 text-white"
                  : "text-slate-400 hover:bg-ink-700 hover:text-slate-200"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>
    </header>
  );
}
