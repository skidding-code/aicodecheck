// TypeScript types mirroring the FastAPI AnalysisResult (snake_case JSON).

export type Classification =
  | "likely_human"
  | "possibly_ai_assisted"
  | "likely_ai_assisted"
  | "likely_ai_generated"
  | "uncertain";

export interface Target {
  kind: string;
  name: string;
  source?: string;
  owner?: string | null;
  repo?: string | null;
  ref?: string | null;
  languages?: Record<string, number>;
  total_files?: number;
  analyzed_files?: number;
  skipped_files?: number;
  total_loc?: number;
  bytes_scanned?: number;
}

export interface Score {
  ai_probability: number;
  human_probability: number;
  confidence: number;
  evidence_score?: number;
  risk_score?: number;
  classification: Classification;
  reasons?: string[];
}

export interface Signal {
  name: string;
  detector: string;
  score: number;
  weight: number;
  confidence: number;
  reason?: string;
  evidence?: string[];
}

export interface EntityAnalysis {
  level: string;
  identifier: string;
  name: string;
  language?: string | null;
  path?: string | null;
  start_line?: number | null;
  end_line?: number | null;
  loc?: number;
  score: Score;
  signals: Signal[];
}

export interface CommitTimelineEntry {
  sha: string;
  author?: string;
  timestamp?: string;
  message?: string;
  insertions?: number;
  deletions?: number;
  files_changed?: number;
}

export interface CommitAnalysis {
  available: boolean;
  total_commits?: number;
  total_authors?: number;
  score?: number;
  signals?: Signal[];
  timeline?: CommitTimelineEntry[];
  reasons?: string[];
}

export interface Contributor {
  name: string;
  email?: string;
  commits: number;
  insertions?: number;
  deletions?: number;
  first_commit?: string;
  last_commit?: string;
}

export interface ContributorAnalysis {
  available: boolean;
  contributors?: Contributor[];
  reasons?: string[];
}

export interface Attribution {
  source: string;
  probability: number;
  rationale?: string;
  confidence?: number;
}

export interface Evidence {
  detector: string;
  signal: string;
  message: string;
  severity?: number | string;
  path?: string | null;
  start_line?: number | null;
  end_line?: number | null;
  snippet?: string | null;
}

export interface FolderHeatmapEntry {
  path: string;
  ai_probability: number;
  confidence: number;
  classification: Classification;
  files: number;
}

export interface FileHeatmapEntry {
  path: string;
  ai_probability: number;
  confidence: number;
  classification: Classification;
  loc: number;
  language?: string;
}

export interface PieEntry {
  label: string;
  value: number;
}

export interface VizCommitTimeline {
  sha: string;
  date?: string;
  insertions?: number;
  deletions?: number;
  files_changed?: number;
  message?: string;
}

export interface SignalBreakdownEntry {
  signal: string;
  mean_score: number;
  count: number;
  mean_confidence: number;
}

export interface SimilarityMatrix {
  labels: string[];
  matrix: number[][];
}

export interface DependencyGraph {
  nodes: { id: string; language?: string; loc?: number }[];
  edges: { source: string; target: string }[];
}

export interface ContributorActivityEntry {
  name?: string;
  commits?: number;
  insertions?: number;
  deletions?: number;
  [k: string]: unknown;
}

export interface Visualizations {
  folder_heatmap?: FolderHeatmapEntry[];
  file_heatmap?: FileHeatmapEntry[];
  classification_pie?: PieEntry[];
  commit_timeline?: VizCommitTimeline[];
  contributor_activity?: ContributorActivityEntry[];
  signal_breakdown?: SignalBreakdownEntry[];
  similarity_matrix?: SimilarityMatrix;
  dependency_graph?: DependencyGraph;
}

export interface AnalysisResult {
  id: string;
  target: Target;
  overall_ai_probability: number;
  human_probability: number;
  classification: Classification;
  confidence: number;
  score: Score;
  files: EntityAnalysis[];
  folders: EntityAnalysis[];
  functions: EntityAnalysis[];
  snippets: EntityAnalysis[];
  commit_analysis?: CommitAnalysis;
  contributor_analysis?: ContributorAnalysis;
  attribution?: Attribution[];
  reasons?: string[];
  evidence?: Evidence[];
  visualizations?: Visualizations;
  recommendations?: string[];
  warnings?: string[];
  elapsed_seconds?: number;
  engine_version?: string;
  disclaimer?: string;
  generated_at?: string;
}

export interface JobResponse {
  id: string;
  status: string;
  kind?: string;
  target?: string;
  progress?: number;
  error?: string | null;
  analysis_id?: string | null;
}

export interface JobCreatedResponse {
  job_id: string;
  status: string;
  message?: string;
}

export interface HistoryItem {
  id: string;
  kind: string;
  target_name: string;
  classification: Classification;
  ai_probability: number;
  confidence: number;
  created_at: string;
}

export interface DetectorInfo {
  name: string;
  description: string;
}

export interface AnalysisStatusResponse {
  status: string;
  progress?: number;
  error?: string | null;
  report?: AnalysisResult | null;
}
