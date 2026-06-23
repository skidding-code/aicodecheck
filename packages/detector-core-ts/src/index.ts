/**
 * AI Project Detector — probabilistic estimation of AI-generated code.
 *
 * TypeScript port of the canonical Python engine. Works in Node and the browser
 * (the only Node-only bit, zlib, is isolated behind a small adapter with a
 * browser fallback). Every result is an estimate. See ``DISCLAIMER``.
 *
 * Public API:
 *     analyzeSnippet(code, { filename, language })
 *     analyzeFiles({ "path": "content", ... })
 *     new Engine(options).analyze(scan)
 */

import { Engine, ENGINE_VERSION } from "./engine.js";
import { loadSnippet, loadFiles, type SnippetOptions } from "./ingestion/loader.js";
import type { AnalysisResult } from "./models.js";

export const __version__ = ENGINE_VERSION;

export interface AnalyzeSnippetOptions extends SnippetOptions {
  engine?: Engine;
}

/** Analyze a single code snippet. */
export function analyzeSnippet(code: string, options: AnalyzeSnippetOptions = {}): AnalysisResult {
  const { engine, ...snippetOpts } = options;
  const scan = loadSnippet(code, snippetOpts);
  return (engine ?? new Engine()).analyze(scan);
}

/** Analyze a set of {relative_path: content} pairs (e.g. drag-and-drop upload). */
export function analyzeFiles(files: Record<string, string>, engine?: Engine): AnalysisResult {
  const scan = loadFiles(files);
  return (engine ?? new Engine()).analyze(scan);
}

// -- Engine + ingestion ----------------------------------------------------- //
export { Engine, ENGINE_VERSION } from "./engine.js";
export type { EngineOptions } from "./engine.js";
export { loadSnippet, loadFiles, classifyFile } from "./ingestion/loader.js";
export type { SnippetOptions } from "./ingestion/loader.js";
export {
  makeScan,
  scanAnalyzable,
  scanLanguages,
  scanTotalLoc,
  fileLoc,
} from "./ingestion/models.js";
export type { Scan, ScannedFile } from "./ingestion/models.js";

// -- Models ----------------------------------------------------------------- //
export {
  DISCLAIMER,
  makeAIScore,
  makeSignal,
  isInformative,
  makeVisualizationData,
  makeCommitAnalysis,
  makeContributorAnalysis,
} from "./models.js";
export type {
  AIScore,
  AnalysisResult,
  AnalysisTarget,
  AttributionGuess,
  Classification,
  CommitAnalysis,
  CommitInfo,
  ContributorAnalysis,
  ContributorStat,
  EntityAnalysis,
  EntityLevel,
  EvidenceItem,
  Signal,
  VisualizationData,
} from "./models.js";

// -- Scoring ---------------------------------------------------------------- //
export { combineSignals, classify } from "./scoring/ensemble.js";
export {
  DEFAULT_PROFILE,
  makeProfile,
  fitProfile,
  profileToJson,
  profileFromJson,
} from "./scoring/calibration.js";
export type { CalibrationProfile, LabeledSample } from "./scoring/calibration.js";

// -- Detectors -------------------------------------------------------------- //
export {
  Detector,
  defaultDetectors,
  register,
  registered,
  StructureDetector,
  StylometryDetector,
  EntropyDetector,
  LLMFingerprintDetector,
  DocumentationDetector,
  CommitHistoryDetector,
  RepoBehaviorDetector,
} from "./detectors/index.js";
export { makeUnit, fileToUnit, unitLoc } from "./detectors/base.js";
export type { AnalysisUnit } from "./detectors/base.js";

// -- Parsing & utils -------------------------------------------------------- //
export { detectLanguage, stripComments } from "./parsing/languages.js";
export { extractEntities, entityLoc } from "./parsing/entities.js";
export type { CodeEntity } from "./parsing/entities.js";
export * as text from "./utils/text.js";
