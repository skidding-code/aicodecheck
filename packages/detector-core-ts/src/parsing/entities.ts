/**
 * Extract code entities (functions, classes, methods) from source files.
 *
 * The Python engine uses ``ast`` for Python and conservative regex heuristics
 * for other languages. This port uses the *generic regex approach for all
 * languages including Python* (per design: the browser has no Python AST). The
 * goal is "good enough" entity boundaries for per-function stylometry, not a
 * full compiler frontend.
 */

export interface CodeEntity {
  kind: "function" | "method" | "class";
  name: string;
  start_line: number; // 1-based, inclusive
  end_line: number; // 1-based, inclusive
  source: string;
  docstring: string | null;
  parent: string | null;
  decorators: string[];
}

export function entityLoc(e: CodeEntity): number {
  return Math.max(0, e.end_line - e.start_line + 1);
}

const GENERIC_LANGUAGES = new Set([
  "python",
  "javascript", "typescript", "java", "kotlin", "go", "rust", "c", "cpp",
  "csharp", "swift", "scala", "php", "dart",
]);

/** Dispatch to the best available extractor for ``language``. */
export function extractEntities(source: string, language: string): CodeEntity[] {
  if (!source.trim()) return [];
  if (GENERIC_LANGUAGES.has(language)) return extractGeneric(source, language);
  return [];
}

// Declaration patterns for C-family / common languages. Mirror of Python's
// _DECL_PATTERNS, anchored to the start of a line (we test trimmed-left lines).
const DECL_PATTERNS: ReadonlyArray<[CodeEntity["kind"], RegExp]> = [
  [
    "class",
    /^\s*(?:export\s+|public\s+|abstract\s+|final\s+|default\s+)*(?:class|interface|struct|enum)\s+([A-Za-z_]\w*)/,
  ],
  [
    "function",
    /^\s*(?:export\s+)?(?:public\s+|private\s+|protected\s+|static\s+|async\s+|final\s+|override\s+)*function\s+([A-Za-z_]\w*)/,
  ],
  ["function", /^\s*(?:export\s+)?(?:async\s+)?def\s+([A-Za-z_]\w*)/], // php/py-like
  ["function", /^\s*func\s+(?:\([^)]*\)\s*)?([A-Za-z_]\w*)\s*\(/], // go
  ["function", /^\s*(?:pub\s+)?(?:async\s+)?fn\s+([A-Za-z_]\w*)/], // rust
  [
    "function",
    /^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_]\w*)\s*=\s*(?:async\s+)?(?:\([^)]*\)|[A-Za-z_]\w*)\s*=>/,
  ], // JS arrow fn
  [
    "function",
    /^\s*(?:public|private|protected|static|async|final|override|\s)+[A-Za-z_][\w<>[\],\s]*\s+([A-Za-z_]\w*)\s*\([^;]*\)\s*\{?\s*$/,
  ],
];

function extractGeneric(source: string, language: string): CodeEntity[] {
  const lines = source.split("\n");
  const entities: CodeEntity[] = [];
  const braceBased = language !== "python";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const [kind, pattern] of DECL_PATTERNS) {
      const m = pattern.exec(line);
      if (!m) continue;
      const name = m[1]!;
      const start = i + 1;
      const end = estimateBlockEnd(lines, i, braceBased);
      entities.push({
        kind,
        name,
        start_line: start,
        end_line: end,
        source: lines.slice(i, end).join("\n"),
        docstring: null,
        parent: null,
        decorators: [],
      });
      break;
    }
  }
  return entities;
}

function countChar(s: string, ch: string): number {
  let c = 0;
  for (let i = 0; i < s.length; i++) if (s[i] === ch) c++;
  return c;
}

/** Estimate the last line of a declaration's body. */
function estimateBlockEnd(lines: string[], startIdx: number, braceBased: boolean): number {
  const n = lines.length;
  if (braceBased) {
    let depth = 0;
    let seenOpen = false;
    for (let j = startIdx; j < n; j++) {
      const lj = lines[j]!;
      depth += countChar(lj, "{") - countChar(lj, "}");
      if (lj.includes("{")) seenOpen = true;
      if (seenOpen && depth <= 0) return j + 1;
    }
    return n;
  }
  // Indentation-based fallback.
  const first = lines[startIdx]!;
  const baseIndent = first.length - first.trimStart().length;
  for (let j = startIdx + 1; j < n; j++) {
    if (!lines[j]!.trim()) continue;
    const indent = lines[j]!.length - lines[j]!.trimStart().length;
    if (indent <= baseIndent) return j;
  }
  return n;
}
