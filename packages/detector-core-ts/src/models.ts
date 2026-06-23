/**
 * Core data models for the AI Project Detector engine.
 *
 * Everything the engine produces is *probabilistic*. No field in this module
 * should ever be interpreted as a definitive statement that code was or was not
 * written by an AI. The vocabulary is deliberately hedged ("likely", "possibly",
 * "estimated") to reflect that AI-authorship detection has irreducible false
 * positive and false negative rates.
 *
 * Field names are kept snake_case to stay wire-compatible with the canonical
 * Python models (pydantic) so both apps can share the same JSON.
 */

import { clamp } from "./utils/text.js";

// The single most important sentence in this codebase. Surfaced in every report.
export const DISCLAIMER =
  "These results are probabilistic estimates, not proof. AI-authorship " +
  "detection is inherently uncertain and produces both false positives and " +
  "false negatives. Do not use these scores as the sole basis for any " +
  "consequential decision about a person or project.";

/** The granularity at which an analysis applies. */
export type EntityLevel =
  | "repository"
  | "folder"
  | "file"
  | "class"
  | "function"
  | "method"
  | "snippet"
  | "line_range";

/**
 * Human-readable bucket for an AI-probability score.
 *
 * Buckets are intentionally coarse and hedged. ``uncertain`` is a first-class
 * outcome: when evidence is weak we say so rather than guessing.
 */
export type Classification =
  | "likely_human"
  | "possibly_ai_assisted"
  | "likely_ai_assisted"
  | "likely_ai_generated"
  | "uncertain";

/** A single, concrete, human-readable piece of supporting evidence. */
export interface EvidenceItem {
  detector: string;
  signal: string;
  /** Plain-language explanation a human can read. */
  message: string;
  /** How strongly this leans AI (0..1). */
  severity: number;
  path: string | null;
  start_line: number | null;
  end_line: number | null;
  snippet: string | null;
  data: Record<string, unknown>;
}

/**
 * One measurable indicator produced by a detector.
 *
 * ``score`` is calibrated so that 0.0 means "looks strongly human", 0.5 means
 * "neutral / no information", and 1.0 means "looks strongly AI-generated".
 * ``confidence`` is independent: how much we trust this measurement at all.
 */
export interface Signal {
  name: string;
  detector: string;
  score: number;
  /** Relative importance in the ensemble. */
  weight: number;
  confidence: number;
  reason: string;
  evidence: EvidenceItem[];
}

/** The aggregate probabilistic verdict for an entity. */
export interface AIScore {
  ai_probability: number;
  human_probability: number;
  confidence: number;
  /** How much concrete evidence backs this verdict. */
  evidence_score: number;
  /** Combined ai_probability x confidence; useful for ranking/triage. */
  risk_score: number;
  classification: Classification;
  reasons: string[];
}

/** A *highly speculative* guess at which tool may have produced the code. */
export interface AttributionGuess {
  source: string; // e.g. "chatgpt", "claude", "gemini", "copilot", "other_llm"
  probability: number;
  rationale: string;
  confidence: number;
}

/** Analysis of a single entity (file, function, class, snippet, ...). */
export interface EntityAnalysis {
  level: EntityLevel;
  /** Stable id: path, or path::symbol for sub-file entities. */
  identifier: string;
  name: string;
  language: string | null;
  path: string | null;
  start_line: number | null;
  end_line: number | null;
  loc: number;
  score: AIScore;
  signals: Signal[];
  parent: string | null;
}

export interface CommitInfo {
  sha: string;
  author: string;
  author_email: string;
  timestamp: string | null;
  message: string;
  insertions: number;
  deletions: number;
  files_changed: number;
}

export interface CommitAnalysis {
  available: boolean;
  total_commits: number;
  total_authors: number;
  score: AIScore;
  signals: Signal[];
  timeline: CommitInfo[];
  reasons: string[];
}

export interface ContributorStat {
  name: string;
  email: string;
  commits: number;
  insertions: number;
  deletions: number;
  first_commit: string | null;
  last_commit: string | null;
}

export interface ContributorAnalysis {
  available: boolean;
  contributors: ContributorStat[];
  reasons: string[];
}

/** Pre-computed, serializable payloads the frontend renders directly. */
export interface VisualizationData {
  folder_heatmap: Array<Record<string, unknown>>;
  file_heatmap: Array<Record<string, unknown>>;
  classification_pie: Array<Record<string, unknown>>;
  commit_timeline: Array<Record<string, unknown>>;
  contributor_activity: Array<Record<string, unknown>>;
  signal_breakdown: Array<Record<string, unknown>>;
  similarity_matrix: Record<string, unknown>;
  dependency_graph: Record<string, unknown>;
}

export interface AnalysisTarget {
  kind: string; // repository | folder | file | snippet | zip
  name: string;
  source: string; // url, path, or "<snippet>"
  owner: string | null;
  repo: string | null;
  ref: string | null;
  languages: Record<string, number>;
  total_files: number;
  analyzed_files: number;
  skipped_files: number;
  total_loc: number;
  bytes_scanned: number;
}

/** The top-level structured response returned by the engine and the API. */
export interface AnalysisResult {
  id: string;
  schema_version: number;
  target: AnalysisTarget;
  overall_ai_probability: number;
  human_probability: number;
  classification: Classification;
  confidence: number;
  score: AIScore;

  files: EntityAnalysis[];
  folders: EntityAnalysis[];
  functions: EntityAnalysis[];
  snippets: EntityAnalysis[];

  commit_analysis: CommitAnalysis;
  contributor_analysis: ContributorAnalysis;
  attribution: AttributionGuess[];

  reasons: string[];
  evidence: EvidenceItem[];
  visualizations: VisualizationData;
  recommendations: string[];

  warnings: string[];
  elapsed_seconds: number;
  engine_version: string;
  disclaimer: string;
  generated_at: string;
}

// --------------------------------------------------------------------------- //
// Factory helpers (mirror pydantic defaults / validators).                     //
// --------------------------------------------------------------------------- //

export function makeAIScore(partial: Partial<AIScore> = {}): AIScore {
  return {
    ai_probability: clamp(partial.ai_probability ?? 0.5),
    human_probability: clamp(partial.human_probability ?? 0.5),
    confidence: clamp(partial.confidence ?? 0.0),
    evidence_score: clamp(partial.evidence_score ?? 0.0),
    risk_score: clamp(partial.risk_score ?? 0.0),
    classification: partial.classification ?? "uncertain",
    reasons: partial.reasons ?? [],
  };
}

export function makeSignal(partial: Partial<Signal> & { name: string; detector: string }): Signal {
  return {
    name: partial.name,
    detector: partial.detector,
    score: clamp(partial.score ?? 0.5),
    weight: Math.max(0.0, partial.weight ?? 1.0),
    confidence: clamp(partial.confidence ?? 0.5),
    reason: partial.reason ?? "",
    evidence: partial.evidence ?? [],
  };
}

/** A signal carries information only if it deviates from neutral. */
export function isInformative(s: Signal): boolean {
  return Math.abs(s.score - 0.5) > 1e-6 && s.confidence > 0.0;
}

export function makeVisualizationData(): VisualizationData {
  return {
    folder_heatmap: [],
    file_heatmap: [],
    classification_pie: [],
    commit_timeline: [],
    contributor_activity: [],
    signal_breakdown: [],
    similarity_matrix: {},
    dependency_graph: {},
  };
}

export function makeCommitAnalysis(partial: Partial<CommitAnalysis> = {}): CommitAnalysis {
  return {
    available: partial.available ?? false,
    total_commits: partial.total_commits ?? 0,
    total_authors: partial.total_authors ?? 0,
    score: partial.score ?? makeAIScore(),
    signals: partial.signals ?? [],
    timeline: partial.timeline ?? [],
    reasons: partial.reasons ?? [],
  };
}

export function makeContributorAnalysis(
  partial: Partial<ContributorAnalysis> = {},
): ContributorAnalysis {
  return {
    available: partial.available ?? false,
    contributors: partial.contributors ?? [],
    reasons: partial.reasons ?? [],
  };
}
