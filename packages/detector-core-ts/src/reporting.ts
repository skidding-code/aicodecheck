/** Build visualization payloads and recommendations from analysis artifacts. */

import {
  makeVisualizationData,
  type AIScore,
  type Classification,
  type EntityAnalysis,
  type VisualizationData,
} from "./models.js";
import { scanAnalyzable, type Scan } from "./ingestion/models.js";
import { fileLoc } from "./ingestion/models.js";
import { ngrams, round, tokenize } from "./utils/text.js";
import { basename } from "./parsing/languages.js";

export interface SignalMeanStats {
  mean_score: number;
  mean_confidence: number;
  count: number;
}

export function buildVisualizations(
  scan: Scan,
  files: EntityAnalysis[],
  folders: EntityAnalysis[],
  _overall: AIScore,
  signalMeans: Record<string, SignalMeanStats>,
): VisualizationData {
  const viz = makeVisualizationData();

  viz.file_heatmap = files.map((f) => ({
    path: f.path,
    ai_probability: f.score.ai_probability,
    confidence: f.score.confidence,
    classification: f.score.classification,
    loc: f.loc,
    language: f.language,
  }));

  viz.folder_heatmap = folders.map((f) => ({
    path: f.path,
    ai_probability: f.score.ai_probability,
    confidence: f.score.confidence,
    classification: f.score.classification,
    files: f.score.reasons.length ? parseInt(f.score.reasons[0]!.split(/\s+/)[0]!, 10) || 0 : 0,
  }));

  const pie = new Map<string, number>();
  for (const f of files) pie.set(f.score.classification, (pie.get(f.score.classification) ?? 0) + 1);
  viz.classification_pie = Array.from(pie.entries()).map(([label, value]) => ({ label, value }));

  viz.commit_timeline = scan.commits.map((c) => ({
    sha: c.sha.slice(0, 10),
    date: c.timestamp,
    insertions: c.insertions,
    deletions: c.deletions,
    files_changed: c.files_changed,
    message: c.message.slice(0, 80),
  }));

  viz.contributor_activity = scan.contributors.map((c) => ({
    name: c.name,
    commits: c.commits,
    insertions: c.insertions,
    deletions: c.deletions,
    first_commit: c.first_commit,
    last_commit: c.last_commit,
  }));

  viz.signal_breakdown = Object.entries(signalMeans)
    .sort((a, b) => Math.abs(b[1].mean_score - 0.5) - Math.abs(a[1].mean_score - 0.5))
    .map(([name, stats]) => ({
      signal: name,
      mean_score: round(stats.mean_score, 4),
      count: Math.trunc(stats.count),
      mean_confidence: round(stats.mean_confidence, 4),
    }));

  viz.similarity_matrix = similarityMatrix(scan);
  viz.dependency_graph = dependencyGraph(scan);
  return viz;
}

/** Jaccard similarity of 4-gram token sets for the largest analyzable files. */
function similarityMatrix(scan: Scan, topN = 15): Record<string, unknown> {
  const files = scanAnalyzable(scan)
    .slice()
    .sort((a, b) => fileLoc(b) - fileLoc(a))
    .slice(0, topN);
  if (files.length < 2) return {};
  const grams: Set<string>[] = [];
  const labels: string[] = [];
  for (const f of files) {
    grams.push(new Set(ngrams(tokenize(f.source), 4)));
    labels.push(f.rel_path);
  }
  const matrix: number[][] = [];
  for (const a of grams) {
    const row: number[] = [];
    for (const b of grams) {
      if (a.size === 0 || b.size === 0) {
        row.push(0.0);
        continue;
      }
      let inter = 0;
      for (const g of a) if (b.has(g)) inter++;
      const union = a.size + b.size - inter;
      row.push(union ? round(inter / union, 3) : 0.0);
    }
    matrix.push(row);
  }
  return { labels, matrix };
}

/** Lightweight intra-repo import graph for Python and JS/TS files. */
function dependencyGraph(scan: Scan, maxNodes = 120): Record<string, unknown> {
  const byModule = new Map<string, string>();
  for (const f of scanAnalyzable(scan)) {
    const stem = f.rel_path.includes(".") ? f.rel_path.slice(0, f.rel_path.lastIndexOf(".")) : f.rel_path;
    byModule.set(stem.replace(/\//g, "."), f.rel_path);
    byModule.set(basename(stem), f.rel_path);
  }

  const nodes: Array<Record<string, unknown>> = [];
  const edges: Array<{ source: string; target: string }> = [];
  const seen = new Set<string>();
  for (const f of scanAnalyzable(scan).slice(0, maxNodes)) {
    nodes.push({ id: f.rel_path, language: f.language, loc: fileLoc(f) });
    seen.add(f.rel_path);
    for (const imp of imports(f.source, f.language)) {
      const target = byModule.get(imp) ?? byModule.get(imp.replace(/\//g, "."));
      if (target && target !== f.rel_path) edges.push({ source: f.rel_path, target });
    }
  }
  const filtered = edges.filter((e) => seen.has(e.source) && seen.has(e.target));
  return { nodes, edges: filtered };
}

function normalizePath(p: string): string {
  // Minimal browser-safe os.path.normpath for relative POSIX paths.
  const parts = p.replace(/\\/g, "/").split("/");
  const out: string[] = [];
  for (const part of parts) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      if (out.length && out[out.length - 1] !== "..") out.pop();
      else out.push("..");
    } else out.push(part);
  }
  return out.join("/");
}

function imports(source: string, language: string): string[] {
  const out: string[] = [];
  if (language === "python") {
    const re = /^\s*(?:from\s+([\w.]+)\s+import|import\s+([\w.]+))/gm;
    for (const m of source.matchAll(re)) {
      const full = (m[1] ?? m[2])!;
      out.push(full.split(".")[0]!);
      if (m[1]) out.push(m[1]);
    }
  } else if (language === "javascript" || language === "typescript") {
    const re = /(?:import[^'"]*from\s*|require\(\s*)['"]([^'"]+)['"]/g;
    for (const m of source.matchAll(re)) {
      const mod = m[1]!;
      if (mod.startsWith(".")) out.push(normalizePath(mod).replace(/^\.\//, ""));
    }
  }
  return out;
}

export function buildRecommendations(
  overall: AIScore,
  scan: Scan,
  files: EntityAnalysis[],
): string[] {
  const recs: string[] = [
    "Treat every score here as a probabilistic estimate, never as proof of AI authorship.",
  ];
  const flagged = files.filter((f) => f.score.ai_probability >= 0.62 && f.score.confidence >= 0.3);
  if (flagged.length) {
    const top = flagged
      .slice()
      .sort((a, b) => b.score.risk_score - a.score.risk_score)
      .slice(0, 5);
    recs.push(
      "Manually review the highest-risk files before drawing conclusions: " +
        top
          .map((f) => f.path)
          .filter((p): p is string => !!p)
          .join(", "),
    );
  }
  if (!scan.git_available) {
    recs.push(
      "No git history was available. Commit-pattern signals were skipped; " +
        "providing the full repository (not just a snapshot) improves accuracy.",
    );
  } else if (scan.commits.length < 5) {
    recs.push(
      "Very little commit history was available, which limits timeline-based signals.",
    );
  }
  if (overall.confidence < 0.3) {
    recs.push(
      "Overall confidence is low. The evidence is insufficient for a strong conclusion; " +
        "gather more code or context before acting.",
    );
  }
  const aiBuckets: Classification[] = ["likely_ai_generated", "likely_ai_assisted"];
  if (aiBuckets.includes(overall.classification)) {
    recs.push(
      "If this assessment affects a person (e.g. academic or hiring decisions), " +
        "corroborate with non-automated methods and give them a chance to respond.",
    );
  }
  return recs;
}
