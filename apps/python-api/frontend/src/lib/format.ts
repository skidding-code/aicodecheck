import type { Classification } from "../types";

export const CLASSIFICATION_LABELS: Record<Classification, string> = {
  likely_human: "Likely Human",
  possibly_ai_assisted: "Possibly AI-Assisted",
  likely_ai_assisted: "Likely AI-Assisted",
  likely_ai_generated: "Likely AI-Generated",
  uncertain: "Uncertain",
};

// Tailwind class bundles per classification (used for chips, borders, accents).
export const CLASSIFICATION_STYLES: Record<
  Classification,
  { chip: string; text: string; bg: string; hex: string }
> = {
  likely_human: {
    chip: "bg-emerald-500/15 text-emerald-300 border border-emerald-500/40",
    text: "text-emerald-300",
    bg: "bg-emerald-500",
    hex: "#34d399",
  },
  possibly_ai_assisted: {
    chip: "bg-sky-500/15 text-sky-300 border border-sky-500/40",
    text: "text-sky-300",
    bg: "bg-sky-500",
    hex: "#38bdf8",
  },
  likely_ai_assisted: {
    chip: "bg-amber-500/15 text-amber-300 border border-amber-500/40",
    text: "text-amber-300",
    bg: "bg-amber-500",
    hex: "#fbbf24",
  },
  likely_ai_generated: {
    chip: "bg-rose-500/15 text-rose-300 border border-rose-500/40",
    text: "text-rose-300",
    bg: "bg-rose-500",
    hex: "#fb7185",
  },
  uncertain: {
    chip: "bg-slate-500/15 text-slate-300 border border-slate-500/40",
    text: "text-slate-300",
    bg: "bg-slate-500",
    hex: "#94a3b8",
  },
};

export function classificationLabel(c?: Classification): string {
  if (!c) return "Unknown";
  return CLASSIFICATION_LABELS[c] ?? c;
}

export function classificationStyle(c?: Classification) {
  return CLASSIFICATION_STYLES[c ?? "uncertain"] ?? CLASSIFICATION_STYLES.uncertain;
}

export function pct(value: number | undefined | null, digits = 0): string {
  if (value == null || Number.isNaN(value)) return "—";
  return `${(value * 100).toFixed(digits)}%`;
}

// Color along green -> amber -> red based on an AI-probability in [0,1].
export function probabilityColor(p: number): string {
  const clamped = Math.max(0, Math.min(1, p));
  // 0 -> green (140deg), 0.5 -> amber (45deg), 1 -> red (0deg)
  const hue = 140 - clamped * 140;
  return `hsl(${hue}, 70%, 50%)`;
}

export function formatDate(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

export function shortDate(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString();
}

export function severityRank(sev: number | string | undefined): number {
  if (typeof sev === "number") return sev;
  const map: Record<string, number> = {
    critical: 4,
    high: 3,
    medium: 2,
    low: 1,
    info: 0,
  };
  return map[String(sev ?? "").toLowerCase()] ?? 0;
}
