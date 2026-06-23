/** Persistent, never-dismissable disclaimer. Estimates are not proof. */
export function DisclaimerBanner() {
  return (
    <div className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-center text-xs text-amber-200">
      <span className="font-semibold">Experimental & probabilistic.</span>{" "}
      These results are statistical estimates, not proof. They have real false-positive
      and false-negative rates and must never be used to accuse, grade, or penalize anyone.
    </div>
  );
}

/** Compact "your code stays local" privacy badge. */
export function PrivacyBadge({ className = "" }: { className?: string }) {
  return (
    <span
      title="All analysis runs in your browser via a Web Worker. Your code is never uploaded to any server."
      className={`chip bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 ${className}`}
    >
      <LockIcon />
      100% in-browser — your code never leaves this tab
    </span>
  );
}

function LockIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="4" y="10" width="16" height="10" rx="2" fill="currentColor" opacity="0.85" />
      <path
        d="M8 10V7a4 4 0 0 1 8 0v3"
        stroke="currentColor"
        strokeWidth="2"
        fill="none"
      />
    </svg>
  );
}
