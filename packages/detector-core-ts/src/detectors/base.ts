/**
 * Detector base class and the unit abstraction they analyze.
 *
 * A *detector* is a pluggable component that inspects code and emits ``Signal``
 * objects. Each signal is a single, explainable measurement on a 0..1 scale
 * where 0.5 is "no information". Detectors never make final decisions; the
 * ensemble combines their signals into a verdict.
 */

import { clamp } from "../utils/text.js";
import type { EvidenceItem, Signal } from "../models.js";
import type { Scan, ScannedFile } from "../ingestion/models.js";

/** A chunk of code to analyze: a whole file, or a function/class/snippet. */
export interface AnalysisUnit {
  source: string;
  language: string;
  path: string;
  kind: string; // file | function | method | class | snippet
  name: string;
  start_line: number | null;
  end_line: number | null;
  is_documentation: boolean;
  is_config: boolean;
}

export function makeUnit(
  partial: Partial<AnalysisUnit> & { source: string; language: string; path: string },
): AnalysisUnit {
  return {
    source: partial.source,
    language: partial.language,
    path: partial.path,
    kind: partial.kind ?? "file",
    name: partial.name ?? "",
    start_line: partial.start_line ?? null,
    end_line: partial.end_line ?? null,
    is_documentation: partial.is_documentation ?? false,
    is_config: partial.is_config ?? false,
  };
}

export function unitLoc(unit: AnalysisUnit): number {
  if (!unit.source) return 0;
  let c = 0;
  for (let i = 0; i < unit.source.length; i++) if (unit.source[i] === "\n") c++;
  return c + 1;
}

export interface EvidenceOptions {
  severity?: number;
  path?: string | null;
  start_line?: number | null;
  end_line?: number | null;
  snippet?: string | null;
  data?: Record<string, unknown>;
}

export interface SignalOptions {
  confidence: number;
  reason: string;
  weight?: number;
  evidence?: EvidenceItem[];
}

/**
 * Base class for all detectors. Subclasses override ``unitSignals`` (per
 * file/function) and/or ``repoSignals`` (whole-scan, cross-file). Both default
 * to empty so a detector only implements the scope it cares about.
 */
export abstract class Detector {
  name = "detector";
  description = "";
  // Multiplies the weight of every signal this detector emits.
  weight = 1.0;

  unitSignals(_unit: AnalysisUnit): Signal[] {
    return [];
  }

  repoSignals(_scan: Scan, _units: AnalysisUnit[]): Signal[] {
    return [];
  }

  // -- helpers -----------------------------------------------------------
  protected signal(name: string, score: number, opts: SignalOptions): Signal {
    return {
      name,
      detector: this.name,
      score: clamp(score),
      weight: (opts.weight ?? 1.0) * this.weight,
      confidence: clamp(opts.confidence),
      reason: opts.reason,
      evidence: opts.evidence ?? [],
    };
  }

  protected evidence(signalName: string, message: string, opts: EvidenceOptions = {}): EvidenceItem {
    return {
      detector: this.name,
      signal: signalName,
      message,
      severity: clamp(opts.severity ?? 0.5),
      path: opts.path ?? null,
      start_line: opts.start_line ?? null,
      end_line: opts.end_line ?? null,
      snippet: opts.snippet ?? null,
      data: opts.data ?? {},
    };
  }
}

export function fileToUnit(f: ScannedFile): AnalysisUnit {
  return makeUnit({
    source: f.source,
    language: f.language,
    path: f.rel_path,
    kind: "file",
    name: f.rel_path,
    is_documentation: f.is_documentation,
    is_config: f.is_config,
  });
}
