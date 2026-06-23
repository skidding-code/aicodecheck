import { PrivacyBadge } from "./DisclaimerBanner";

export function Header({
  view,
  onView,
}: {
  view: "analyze" | "about";
  onView: (v: "analyze" | "about") => void;
}) {
  return (
    <header className="border-b border-ink-700 bg-ink-900/60 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-4 py-4">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-brand-500/20 text-brand-400">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M12 3l7 4v6c0 4-3 6.5-7 8-4-1.5-7-4-7-8V7l7-4z"
                stroke="currentColor"
                strokeWidth="1.8"
                fill="currentColor"
                fillOpacity="0.15"
              />
              <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="1.8" fill="none" />
            </svg>
          </div>
          <div>
            <h1 className="text-lg font-semibold leading-tight">AI Project Detector</h1>
            <p className="text-xs text-slate-400">Browser-only edition — no backend</p>
          </div>
        </div>

        <nav className="ml-auto flex items-center gap-2">
          <button
            className={`btn ${view === "analyze" ? "btn-primary" : "btn-ghost"}`}
            onClick={() => onView("analyze")}
          >
            Analyze
          </button>
          <button
            className={`btn ${view === "about" ? "btn-primary" : "btn-ghost"}`}
            onClick={() => onView("about")}
          >
            About
          </button>
        </nav>

        <div className="w-full md:w-auto">
          <PrivacyBadge />
        </div>
      </div>
    </header>
  );
}
