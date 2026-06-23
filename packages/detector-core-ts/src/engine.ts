/**
 * The analysis engine: orchestrates ingestion output -> structured result.
 *
 *     import { Engine } from "@aicodecheck/detector-core";
 *     const result = new Engine().analyze(scan);
 */

import {
  DISCLAIMER,
  makeAIScore,
  makeCommitAnalysis,
  makeContributorAnalysis,
  isInformative,
  type AIScore,
  type AnalysisResult,
  type AnalysisTarget,
  type CommitAnalysis,
  type ContributorAnalysis,
  type EntityAnalysis,
  type EntityLevel,
  type EvidenceItem,
  type Signal,
} from "./models.js";
import {
  scanAnalyzable,
  scanLanguages,
  scanTotalLoc,
  fileLoc,
  type Scan,
  type ScannedFile,
} from "./ingestion/models.js";
import {
  defaultDetectors,
  fileToUnit,
  makeUnit,
  type AnalysisUnit,
  type Detector,
} from "./detectors/index.js";
import { estimateAttribution } from "./detectors/attribution.js";
import { extractEntities, entityLoc } from "./parsing/entities.js";
import { buildRecommendations, buildVisualizations, type SignalMeanStats } from "./reporting.js";
import { DEFAULT_PROFILE, type CalibrationProfile } from "./scoring/calibration.js";
import { combineSignals } from "./scoring/ensemble.js";

export const ENGINE_VERSION = "0.1.0";

export interface EngineOptions {
  detectors?: Detector[];
  profile?: CalibrationProfile;
  maxFunctions?: number;
  maxFilesDetailed?: number;
}

function uuidHex(): string {
  // Browser-safe random id; falls back to Math.random when crypto is absent.
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID().replace(/-/g, "");
  let s = "";
  for (let i = 0; i < 32; i++) s += Math.floor(Math.random() * 16).toString(16);
  return s;
}

function now(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

/** Runs the configured detectors over a Scan and produces an AnalysisResult. */
export class Engine {
  private detectors: Detector[];
  private profile: CalibrationProfile;
  private maxFunctions: number;
  private maxFilesDetailed: number;

  constructor(options: EngineOptions = {}) {
    this.detectors = options.detectors ?? defaultDetectors();
    this.profile = options.profile ?? DEFAULT_PROFILE;
    this.maxFunctions = options.maxFunctions ?? 4000;
    this.maxFilesDetailed = options.maxFilesDetailed ?? 5000;
  }

  analyze(scan: Scan, analysisId?: string): AnalysisResult {
    const start = now();
    const id = analysisId ?? uuidHex();

    const analyzable = scanAnalyzable(scan).slice(0, this.maxFilesDetailed);
    const fileUnits = analyzable.map((f) => fileToUnit(f));

    const { entities: fileEntities, signalMap: fileSignalMap } = this.analyzeFiles(
      analyzable,
      fileUnits,
    );
    const { entities: functionEntities, units: functionUnits } = this.analyzeFunctions(analyzable);

    const allUnits = [...fileUnits, ...functionUnits];
    const repoSignals = this.repoSignals(scan, allUnits);

    const overall = this.overallScore(fileEntities, repoSignals, fileSignalMap);
    const folders = this.analyzeFolders(fileEntities);

    const commitAnalysis = this.commitAnalysis(scan, repoSignals);
    const contributorAnalysis = this.contributorAnalysis(scan);
    const attribution = estimateAttribution(scan, overall.ai_probability);

    const signalMeans = this.signalMeans(fileSignalMap, repoSignals);
    const evidence = this.collectEvidence(fileSignalMap, repoSignals);
    const viz = buildVisualizations(scan, fileEntities, folders, overall, signalMeans);
    const recommendations = buildRecommendations(overall, scan, fileEntities);

    const target: AnalysisTarget = {
      kind: scan.kind,
      name: scan.name,
      source: scan.source,
      owner: scan.owner,
      repo: scan.repo,
      ref: scan.ref,
      languages: scanLanguages(scan),
      total_files: scan.files.length,
      analyzed_files: analyzable.length,
      skipped_files: scan.skipped_files,
      total_loc: scanTotalLoc(scan),
      bytes_scanned: scan.bytes_scanned,
    };

    return {
      id,
      schema_version: 1,
      target,
      overall_ai_probability: overall.ai_probability,
      human_probability: overall.human_probability,
      classification: overall.classification,
      confidence: overall.confidence,
      score: overall,
      files: fileEntities,
      folders,
      functions: functionEntities,
      snippets: [],
      commit_analysis: commitAnalysis,
      contributor_analysis: contributorAnalysis,
      attribution,
      reasons: overall.reasons,
      evidence,
      visualizations: viz,
      recommendations,
      warnings: [...scan.warnings],
      elapsed_seconds: Math.round((now() - start) / 1000 * 1000) / 1000,
      engine_version: ENGINE_VERSION,
      disclaimer: DISCLAIMER,
      generated_at: new Date().toISOString(),
    };
  }

  private analyzeFiles(
    analyzable: ScannedFile[],
    fileUnits: AnalysisUnit[],
  ): { entities: EntityAnalysis[]; signalMap: Map<string, Signal[]> } {
    const entities: EntityAnalysis[] = [];
    const signalMap = new Map<string, Signal[]>();
    for (let i = 0; i < analyzable.length; i++) {
      const f = analyzable[i]!;
      const unit = fileUnits[i]!;
      const signals: Signal[] = [];
      for (const det of this.detectors) signals.push(...det.unitSignals(unit));
      const score = combineSignals(signals, this.profile);
      signalMap.set(f.rel_path, signals);
      entities.push({
        level: "file",
        identifier: f.rel_path,
        name: f.rel_path,
        language: f.language,
        path: f.rel_path,
        start_line: null,
        end_line: null,
        loc: fileLoc(f),
        score,
        signals,
        parent: null,
      });
    }
    entities.sort((a, b) => b.score.risk_score - a.score.risk_score);
    return { entities, signalMap };
  }

  private analyzeFunctions(analyzable: ScannedFile[]): {
    entities: EntityAnalysis[];
    units: AnalysisUnit[];
  } {
    const entities: EntityAnalysis[] = [];
    const units: AnalysisUnit[] = [];
    for (const f of analyzable) {
      if (f.is_documentation || f.is_config) continue;
      for (const ent of extractEntities(f.source, f.language)) {
        const unit = makeUnit({
          source: ent.source,
          language: f.language,
          path: f.rel_path,
          kind: ent.kind,
          name: ent.name,
          start_line: ent.start_line,
          end_line: ent.end_line,
        });
        units.push(unit);
        if (entities.length >= this.maxFunctions) continue;
        const signals: Signal[] = [];
        for (const det of this.detectors) signals.push(...det.unitSignals(unit));
        if (!signals.length) continue;
        const level: EntityLevel =
          ent.kind === "class" ? "class" : ent.kind === "method" ? "method" : "function";
        entities.push({
          level,
          identifier: `${f.rel_path}::${ent.name}`,
          name: ent.name,
          language: f.language,
          path: f.rel_path,
          start_line: ent.start_line,
          end_line: ent.end_line,
          loc: entityLoc(ent),
          score: combineSignals(signals, this.profile),
          signals,
          parent: ent.parent,
        });
      }
    }
    entities.sort((a, b) => b.score.risk_score - a.score.risk_score);
    return { entities, units };
  }

  private repoSignals(scan: Scan, allUnits: AnalysisUnit[]): Signal[] {
    const signals: Signal[] = [];
    for (const det of this.detectors) signals.push(...det.repoSignals(scan, allUnits));
    return signals;
  }

  private overallScore(
    fileEntities: EntityAnalysis[],
    repoSignals: Signal[],
    fileSignalMap: Map<string, Signal[]>,
  ): AIScore {
    // For small inputs we pool the raw per-file signals so reasons are concrete.
    if (fileEntities.length <= 3) {
      const raw: Signal[] = [];
      for (const sigs of fileSignalMap.values()) raw.push(...sigs);
      return combineSignals([...repoSignals, ...raw], this.profile, { maxReasons: 8 });
    }
    // For larger inputs, each file contributes one synthetic signal weighted by
    // log(size) so a single large file cannot dominate.
    const synthetic: Signal[] = [];
    for (const fe of fileEntities) {
      if (fe.score.confidence <= 0) continue;
      synthetic.push({
        name: `file::${fe.path}`,
        detector: "aggregate",
        score: fe.score.ai_probability,
        weight: Math.log2(fe.loc + 2),
        confidence: fe.score.confidence,
        reason: `Aggregated file score for ${fe.path}.`,
        evidence: [],
      });
    }
    return combineSignals([...repoSignals, ...synthetic], this.profile, { maxReasons: 8 });
  }

  private analyzeFolders(fileEntities: EntityAnalysis[]): EntityAnalysis[] {
    const groups = new Map<string, EntityAnalysis[]>();
    for (const fe of fileEntities) {
      const path = fe.path ?? "";
      const folder = path.split("/").slice(0, -1).join("/") || ".";
      const parts = folder.split("/");
      for (let i = 0; i < parts.length; i++) {
        const key = parts.slice(0, i + 1).join("/");
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(fe);
      }
    }

    const folders: EntityAnalysis[] = [];
    for (const [path, members] of groups) {
      if (path === "") continue;
      const synth: Signal[] = members
        .filter((m) => m.score.confidence > 0)
        .map((m) => ({
          name: `file::${m.path}`,
          detector: "aggregate",
          score: m.score.ai_probability,
          weight: Math.log2(m.loc + 2),
          confidence: m.score.confidence,
          reason: "",
          evidence: [],
        }));
      const score = combineSignals(synth, this.profile);
      score.reasons = [`${members.length} files aggregated under this folder.`];
      folders.push({
        level: "folder",
        identifier: path,
        name: path,
        language: null,
        path,
        start_line: null,
        end_line: null,
        loc: members.reduce((a, m) => a + m.loc, 0),
        score,
        signals: [],
        parent: null,
      });
    }
    folders.sort((a, b) => b.score.risk_score - a.score.risk_score);
    return folders;
  }

  private commitAnalysis(scan: Scan, repoSignals: Signal[]): CommitAnalysis {
    const commitSignals = repoSignals.filter((s) => s.detector === "commit_history");
    const score = commitSignals.length ? combineSignals(commitSignals, this.profile) : makeAIScore();
    return makeCommitAnalysis({
      available: scan.git_available,
      total_commits: scan.commits.length,
      total_authors: scan.contributors.length,
      score,
      signals: commitSignals,
      timeline: scan.commits.slice(0, 500),
      reasons: score.reasons,
    });
  }

  private contributorAnalysis(scan: Scan): ContributorAnalysis {
    return makeContributorAnalysis({
      available: scan.git_available,
      contributors: scan.contributors,
      reasons: scan.git_available
        ? [`${scan.contributors.length} contributor(s) detected.`]
        : ["No git history available; contributor analysis skipped."],
    });
  }

  private signalMeans(
    fileSignalMap: Map<string, Signal[]>,
    repoSignals: Signal[],
  ): Record<string, SignalMeanStats> {
    const buckets = new Map<string, Signal[]>();
    const add = (s: Signal) => {
      if (!isInformative(s)) return;
      if (!buckets.has(s.name)) buckets.set(s.name, []);
      buckets.get(s.name)!.push(s);
    };
    for (const signals of fileSignalMap.values()) for (const s of signals) add(s);
    for (const s of repoSignals) add(s);
    const out: Record<string, SignalMeanStats> = {};
    for (const [name, sigs] of buckets) {
      out[name] = {
        mean_score: sigs.reduce((a, s) => a + s.score, 0) / sigs.length,
        mean_confidence: sigs.reduce((a, s) => a + s.confidence, 0) / sigs.length,
        count: sigs.length,
      };
    }
    return out;
  }

  private collectEvidence(
    fileSignalMap: Map<string, Signal[]>,
    repoSignals: Signal[],
    limit = 60,
  ): EvidenceItem[] {
    const items: EvidenceItem[] = [];
    for (const signals of fileSignalMap.values())
      for (const s of signals) items.push(...s.evidence);
    for (const s of repoSignals) items.push(...s.evidence);
    items.sort((a, b) => b.severity - a.severity);
    return items.slice(0, limit);
  }
}
