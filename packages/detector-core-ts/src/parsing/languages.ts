/**
 * Language detection and comment handling. Faithful port of
 * ``aiprojectdetector.parsing.languages`` using browser-safe path handling
 * (no ``node:path``).
 */

import {
  BINARY_EXTENSIONS,
  EXTENSION_LANGUAGE,
  GENERATED_FILE_MARKERS,
  LINE_COMMENT_TOKENS,
} from "../constants.js";

// Special filenames without informative extensions.
const FILENAME_LANGUAGE: Readonly<Record<string, string>> = {
  dockerfile: "dockerfile",
  makefile: "makefile",
  "cmakelists.txt": "cmake",
  "go.mod": "go",
  "go.sum": "go",
  gemfile: "ruby",
  rakefile: "ruby",
  "requirements.txt": "pip-requirements",
  pipfile: "toml",
  "package.json": "json",
};

/** POSIX-style basename (browser-safe; handles both separators). */
export function basename(path: string): string {
  const norm = path.replace(/\\/g, "/");
  const parts = norm.split("/");
  return parts[parts.length - 1] ?? "";
}

/** Returns the extension including the leading dot, or "" (mirrors os.path.splitext). */
export function extname(path: string): string {
  const base = basename(path);
  const dot = base.lastIndexOf(".");
  // No extension if there is no dot, or the only dot is a leading one (dotfile).
  if (dot <= 0) return "";
  return base.slice(dot);
}

/** Best-effort language for a path, optionally using a content sample. */
export function detectLanguage(path: string, sample?: string | null): string {
  const base = basename(path).toLowerCase();
  if (base in FILENAME_LANGUAGE) return FILENAME_LANGUAGE[base]!;

  const ext = extname(base);
  if (ext in EXTENSION_LANGUAGE) return EXTENSION_LANGUAGE[ext]!;

  // Shebang sniffing for extensionless scripts.
  if (sample) {
    const first = sample.split("\n", 1)[0] ?? "";
    if (first.startsWith("#!")) {
      if (first.includes("python")) return "python";
      if (first.includes("node")) return "javascript";
      if (["bash", "sh", "zsh"].some((sh) => first.includes(sh))) return "shell";
      if (first.includes("ruby")) return "ruby";
    }
  }
  return "unknown";
}

export function hasBinaryExtension(path: string): boolean {
  return BINARY_EXTENSIONS.has(extname(path.toLowerCase()));
}

/** Detect machine-generated source via well-known banner markers. */
export function isProbablyGenerated(sample: string): boolean {
  const head = sample.slice(0, 2048).toLowerCase();
  return GENERATED_FILE_MARKERS.some((marker) => head.includes(marker.toLowerCase()));
}

export function commentTokens(language: string): readonly string[] {
  return LINE_COMMENT_TOKENS[language] ?? ["//", "#"];
}

const BLOCK_COMMENT_LANGUAGES = new Set([
  "javascript", "typescript", "java", "kotlin", "go", "rust", "c", "cpp",
  "csharp", "swift", "scala", "php", "dart", "css", "scss",
]);

/**
 * Split source into [code-without-line-comments, list_of_comment_texts].
 * Intentionally simple and language-agnostic; never raises.
 */
export function stripComments(source: string, language: string): [string, string[]] {
  const tokens = commentTokens(language);
  const codeLines: string[] = [];
  const comments: string[] = [];

  let text = source;
  if (BLOCK_COMMENT_LANGUAGES.has(language)) {
    const [stripped, block] = extractBlockComments(text, "/*", "*/");
    text = stripped;
    comments.push(...block);
  }

  for (const raw of text.split("\n")) {
    let line = raw;
    let cut: number | null = null;
    for (const tok of tokens) {
      const idx = line.indexOf(tok);
      if (idx !== -1 && (cut === null || idx < cut)) cut = idx;
    }
    if (cut !== null) {
      const comment = lstrip(line.slice(cut), "#/-* \t");
      if (comment) comments.push(comment);
      line = line.slice(0, cut);
    }
    codeLines.push(line);
  }

  return [codeLines.join("\n"), comments];
}

function lstrip(s: string, chars: string): string {
  let i = 0;
  while (i < s.length && chars.includes(s[i]!)) i++;
  return s.slice(i);
}

function extractBlockComments(
  text: string,
  openTok: string,
  closeTok: string,
): [string, string[]] {
  const comments: string[] = [];
  const out: string[] = [];
  let i = 0;
  const n = text.length;
  while (i < n) {
    const start = text.indexOf(openTok, i);
    if (start === -1) {
      out.push(text.slice(i));
      break;
    }
    out.push(text.slice(i, start));
    const end = text.indexOf(closeTok, start + openTok.length);
    if (end === -1) {
      comments.push(text.slice(start + openTok.length));
      break;
    }
    comments.push(text.slice(start + openTok.length, end));
    i = end + closeTok.length;
  }
  return [out.join(""), comments];
}
