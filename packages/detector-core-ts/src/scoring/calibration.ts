/**
 * Calibration: thresholds and (optional) data-fitted signal weights.
 *
 * The engine ships with transparent default thresholds. ``fitProfile`` can
 * learn per-signal weight multipliers from a labeled corpus using a simple,
 * explainable mean-separation heuristic (no ML dependency in the core).
 */

export interface CalibrationProfile {
  // ai_probability thresholds for classification buckets.
  t_human: number;
  t_assisted_low: number;
  t_assisted_high: number;
  t_generated: number;
  // Minimum confidence below which we always say "uncertain".
  min_confidence: number;
  // Gain applied to the aggregated deviation (amplifies agreement).
  gain: number;
  // Per-signal weight multipliers learned from data (name -> multiplier).
  weight_overrides: Record<string, number>;
  // Bookkeeping.
  fitted_on: string;
  samples: number;
}

export function makeProfile(partial: Partial<CalibrationProfile> = {}): CalibrationProfile {
  return {
    t_human: partial.t_human ?? 0.42,
    t_assisted_low: partial.t_assisted_low ?? 0.52,
    t_assisted_high: partial.t_assisted_high ?? 0.62,
    t_generated: partial.t_generated ?? 0.72,
    min_confidence: partial.min_confidence ?? 0.25,
    gain: partial.gain ?? 1.25,
    weight_overrides: partial.weight_overrides ?? {},
    fitted_on: partial.fitted_on ?? "defaults",
    samples: partial.samples ?? 0,
  };
}

export const DEFAULT_PROFILE: CalibrationProfile = makeProfile();

export function profileToJson(p: CalibrationProfile): string {
  return JSON.stringify(p, Object.keys(p).sort(), 2);
}

export function profileFromJson(text: string): CalibrationProfile {
  return makeProfile(JSON.parse(text) as Partial<CalibrationProfile>);
}

export type LabeledSample = [Record<string, number>, number];

/**
 * Learn weight multipliers from labeled signal vectors. ``samples`` is a list
 * of [signalName -> score, label] where label is 1 for AI-generated and 0 for
 * human. Light, explainable mean-separation fit (auditable, not a black box).
 */
export function fitProfile(
  samples: LabeledSample[],
  base: CalibrationProfile = makeProfile(),
): CalibrationProfile {
  if (samples.length === 0) return base;
  const names = new Set<string>();
  for (const [feats] of samples) for (const n of Object.keys(feats)) names.add(n);
  const overrides = fitMeanSeparation(samples, Array.from(names).sort());
  return makeProfile({
    t_human: base.t_human,
    t_assisted_low: base.t_assisted_low,
    t_assisted_high: base.t_assisted_high,
    t_generated: base.t_generated,
    min_confidence: base.min_confidence,
    gain: base.gain,
    weight_overrides: overrides,
    fitted_on: "mean-separation",
    samples: samples.length,
  });
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0.0;
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

function fitMeanSeparation(samples: LabeledSample[], names: string[]): Record<string, number> {
  const overrides: Record<string, number> = {};
  for (const n of names) {
    const aiVals: number[] = [];
    const huVals: number[] = [];
    for (const [feats, lbl] of samples) {
      if (!(n in feats)) continue;
      if (lbl === 1) aiVals.push(feats[n]!);
      else if (lbl === 0) huVals.push(feats[n]!);
    }
    if (!aiVals.length || !huVals.length) continue;
    const sep = Math.abs(mean(aiVals) - mean(huVals));
    overrides[n] = round3(0.5 + Math.min(1.5, (sep / 0.4) * 1.5));
  }
  return overrides;
}
