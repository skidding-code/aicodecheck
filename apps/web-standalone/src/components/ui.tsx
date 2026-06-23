import type { ReactNode } from "react";

export function Card({
  title,
  children,
  className = "",
}: {
  title?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`card ${className}`}>
      {title ? <h3 className="card-title">{title}</h3> : null}
      {children}
    </section>
  );
}

/** A labelled horizontal meter (0..1). */
export function Meter({
  label,
  value,
  color = "#4d8bff",
  caption,
}: {
  label: string;
  value: number;
  color?: string;
  caption?: string;
}) {
  const w = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
          {label}
        </span>
        <span className="font-mono text-sm text-slate-200">{w.toFixed(0)}%</span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-ink-800">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${w}%`, backgroundColor: color }}
        />
      </div>
      {caption ? (
        <p className="mt-1 text-xs text-slate-500">{caption}</p>
      ) : null}
    </div>
  );
}

export function Tabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: { id: T; label: string }[];
  active: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1 rounded-lg border border-ink-700 bg-ink-900 p-1">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
            active === t.id
              ? "bg-brand-500 text-white"
              : "text-slate-300 hover:bg-ink-800"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
