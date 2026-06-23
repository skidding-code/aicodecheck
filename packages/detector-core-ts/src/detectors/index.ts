/**
 * Detector registry.
 *
 * The registry is the plugin seam: external packages can register additional
 * detectors via ``register()`` without modifying the engine.
 * ``defaultDetectors()`` returns the built-in set.
 *
 * NOTE: ``commit_history`` and ``repo_behavior`` are kept as no-op detectors so
 * the engine's interfaces are preserved, but they emit no signals because the
 * browser has no git history available. App-specific Node adapters may register
 * real implementations.
 */

import type { Signal } from "../models.js";
import type { Scan } from "../ingestion/models.js";
import { Detector, type AnalysisUnit } from "./base.js";
import { StructureDetector } from "./structure.js";
import { StylometryDetector } from "./stylometry.js";
import { EntropyDetector } from "./entropy.js";
import { LLMFingerprintDetector } from "./llmFingerprint.js";
import { DocumentationDetector } from "./documentation.js";
import { AuthorshipArtifactsDetector } from "./authorship.js";

/** Interface-preserving stub: git history is unavailable in the browser. */
export class CommitHistoryDetector extends Detector {
  override name = "commit_history";
  override description = "Commit-message and cadence heuristics (requires git history).";
  override repoSignals(_scan: Scan, _units: AnalysisUnit[]): Signal[] {
    return [];
  }
}

/** Interface-preserving stub: repo-level git behavior is unavailable here. */
export class RepoBehaviorDetector extends Detector {
  override name = "repo_behavior";
  override description = "Repository-shape and behavior heuristics (requires git history).";
  override repoSignals(_scan: Scan, _units: AnalysisUnit[]): Signal[] {
    return [];
  }
}

type DetectorCtor = new () => Detector;

const _REGISTRY = new Map<string, DetectorCtor>();

/** Register a detector class. */
export function register(detectorCls: DetectorCtor): DetectorCtor {
  _REGISTRY.set(new detectorCls().name, detectorCls);
  return detectorCls;
}

export function registered(): Map<string, DetectorCtor> {
  return new Map(_REGISTRY);
}

for (const cls of [
  StructureDetector,
  StylometryDetector,
  EntropyDetector,
  LLMFingerprintDetector,
  DocumentationDetector,
  CommitHistoryDetector,
  RepoBehaviorDetector,
  AuthorshipArtifactsDetector,
]) {
  register(cls);
}

/** Instantiate the built-in detector set. */
export function defaultDetectors(): Detector[] {
  return Array.from(_REGISTRY.values()).map((cls) => new cls());
}

export {
  Detector,
  StructureDetector,
  StylometryDetector,
  EntropyDetector,
  LLMFingerprintDetector,
  DocumentationDetector,
  AuthorshipArtifactsDetector,
};
export { fileToUnit, makeUnit, unitLoc } from "./base.js";
export type { AnalysisUnit } from "./base.js";
