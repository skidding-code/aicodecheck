/**
 * High-level, browser-safe ingestion entry points producing a ready-to-analyze
 * ``Scan``. Ports ``load_snippet`` and ``load_files``. Filesystem-based loaders
 * (folder/zip/github) are intentionally omitted from the core: those require
 * Node-only or network APIs and belong in app-specific adapters.
 */

import { detectLanguage, isProbablyGenerated, basename, extname } from "../parsing/languages.js";
import { makeScan, type Scan, type ScannedFile } from "./models.js";

const _DOC_NAMES = ["readme", "contributing", "changelog", "license", "code_of_conduct", "security"];
const _CONFIG_EXT = new Set([".yml", ".yaml", ".toml", ".ini", ".cfg", ".json", ".env", ".conf", ".properties"]);
const _DEP_MANIFESTS = new Set([
  "package.json", "requirements.txt", "pyproject.toml", "setup.py", "setup.cfg",
  "pipfile", "cargo.toml", "go.mod", "pom.xml", "build.gradle", "gemfile",
  "composer.json", "build.sbt",
]);
const _CI_DIRS = [".github/workflows", ".gitlab", ".circleci", ".buildkite"];
const _CI_FILES = [".travis.yml", "azure-pipelines.yml", "jenkinsfile", ".gitlab-ci.yml", "bitbucket-pipelines.yml"];

interface FileFlags {
  is_documentation: boolean;
  is_config: boolean;
  is_test: boolean;
  is_ci: boolean;
  is_dependency_manifest: boolean;
}

/** Mirror of walker._classify so uploaded files get correct flags too. */
export function classifyFile(relPath: string, language: string): FileFlags {
  const lower = relPath.toLowerCase();
  const base = basename(lower);
  const ext = extname(base);
  const nameNoExt = ext ? base.slice(0, base.length - ext.length) : base;
  return {
    is_documentation:
      language === "markdown" ||
      language === "restructuredtext" ||
      _DOC_NAMES.some((d) => base.startsWith(d)),
    is_config: _CONFIG_EXT.has(ext) || ["yaml", "toml", "json", "xml"].includes(language),
    is_test: lower.includes("test") || lower.includes("spec") || nameNoExt.endsWith("_test") || nameNoExt.endsWith(".test"),
    is_ci: _CI_DIRS.some((d) => lower.includes(d)) || _CI_FILES.includes(base),
    is_dependency_manifest: _DEP_MANIFESTS.has(base),
  };
}

function utf8ByteLength(s: string): number {
  return new TextEncoder().encode(s).length;
}

export interface SnippetOptions {
  filename?: string;
  language?: string | null;
}

export function loadSnippet(code: string, opts: SnippetOptions = {}): Scan {
  const filename = opts.filename ?? "snippet.txt";
  const lang = opts.language ?? detectLanguage(filename, code.slice(0, 512));
  const flags = classifyFile(filename, lang);
  const sf: ScannedFile = {
    rel_path: filename,
    abs_path: null,
    language: lang,
    size_bytes: utf8ByteLength(code),
    source: code,
    is_generated: isProbablyGenerated(code),
    ...flags,
  };
  const scan = makeScan({ kind: "snippet", name: filename, source: "<snippet>" });
  scan.files = [sf];
  scan.bytes_scanned = sf.size_bytes;
  return scan;
}

/** Load a set of {relative_path: content} pairs (e.g. drag-and-drop). */
export function loadFiles(files: Record<string, string>): Scan {
  const scan = makeScan({ kind: "folder", name: "uploaded-files", source: "<files>" });
  for (const [rel, content] of Object.entries(files)) {
    const relPath = rel.replace(/\\/g, "/");
    const lang = detectLanguage(relPath, content.slice(0, 512));
    const flags = classifyFile(relPath, lang);
    scan.files.push({
      rel_path: relPath,
      abs_path: null,
      language: lang,
      size_bytes: utf8ByteLength(content),
      source: content,
      is_generated: isProbablyGenerated(content),
      ...flags,
    });
  }
  scan.bytes_scanned = scan.files.reduce((a, f) => a + f.size_bytes, 0);
  return scan;
}
