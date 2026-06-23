/** Display helpers for rendering AnalysisResult fields. */
import type { Classification } from "@aicodecheck/detector-core";

export function pct(value: number, digits = 0): string {
  return `${(value * 100).toFixed(digits)}%`;
}

export const CLASSIFICATION_LABEL: Record<Classification, string> = {
  likely_human: "Likely human",
  possibly_ai_assisted: "Possibly AI-assisted",
  likely_ai_assisted: "Likely AI-assisted",
  likely_ai_generated: "Likely AI-generated",
  uncertain: "Uncertain",
};

/** Tailwind classes for a classification chip. */
export function classificationChip(c: Classification): string {
  switch (c) {
    case "likely_human":
      return "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30";
    case "possibly_ai_assisted":
      return "bg-amber-500/15 text-amber-300 border border-amber-500/30";
    case "likely_ai_assisted":
      return "bg-orange-500/15 text-orange-300 border border-orange-500/30";
    case "likely_ai_generated":
      return "bg-rose-500/15 text-rose-300 border border-rose-500/30";
    case "uncertain":
    default:
      return "bg-slate-500/15 text-slate-300 border border-slate-500/30";
  }
}

/** Color along a green->red scale for an AI probability (0..1). */
export function heatColor(p: number): string {
  // 0 => green, 0.5 => amber, 1 => red
  const hue = Math.round((1 - Math.min(1, Math.max(0, p))) * 120); // 120=green,0=red
  return `hsl(${hue}, 70%, 45%)`;
}

export function readableConfidence(c: number): string {
  if (c < 0.2) return "very low";
  if (c < 0.4) return "low";
  if (c < 0.6) return "moderate";
  if (c < 0.8) return "high";
  return "very high";
}

export function downloadJson(data: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
