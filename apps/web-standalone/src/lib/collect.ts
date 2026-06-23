/**
 * Client-side file collection helpers.
 *
 * Turns various local inputs (chosen files, dropped folders, ZIP archives) into
 * a plain {relativePath: textContent} map ready to hand to the engine. All
 * reading happens in the browser via FileReader / ArrayBuffer; nothing is
 * uploaded anywhere.
 */

/** Per-file size cap (~2MB). Larger files are skipped. */
export const MAX_FILE_BYTES = 2 * 1024 * 1024;

/** Directory names we never descend into. */
const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "vendor",
  "target",
  ".next",
  ".nuxt",
  ".svelte-kit",
  ".cache",
  "coverage",
  ".venv",
  "venv",
  "__pycache__",
  ".idea",
  ".vscode",
  "out",
]);

/** Exact filenames to skip (lockfiles, etc.). */
const SKIP_FILES = new Set([
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "poetry.lock",
  "cargo.lock",
  "composer.lock",
  "gemfile.lock",
  "go.sum",
  ".ds_store",
]);

/** Extensions that are binary / non-source and should be skipped. */
const BINARY_EXT = new Set([
  "png", "jpg", "jpeg", "gif", "webp", "bmp", "ico", "svg", "avif",
  "mp3", "mp4", "mov", "avi", "wav", "ogg", "flac", "webm",
  "pdf", "zip", "gz", "tar", "tgz", "rar", "7z", "bz2", "xz",
  "woff", "woff2", "ttf", "otf", "eot",
  "exe", "dll", "so", "dylib", "bin", "o", "a", "class", "jar",
  "wasm", "pyc", "pyd", "node",
  "db", "sqlite", "sqlite3", "lock",
  "doc", "docx", "xls", "xlsx", "ppt", "pptx",
]);

export interface CollectResult {
  files: Record<string, string>;
  skipped: string[];
}

function ext(path: string): string {
  const base = path.split("/").pop() ?? path;
  const dot = base.lastIndexOf(".");
  return dot >= 0 ? base.slice(dot + 1).toLowerCase() : "";
}

function baseName(path: string): string {
  return (path.split("/").pop() ?? path).toLowerCase();
}

/** Should this relative path be analyzed? (dirs + filename + extension rules) */
export function shouldKeep(relPath: string): boolean {
  const parts = relPath.split("/");
  for (const part of parts.slice(0, -1)) {
    if (SKIP_DIRS.has(part)) return false;
  }
  if (SKIP_FILES.has(baseName(relPath))) return false;
  if (BINARY_EXT.has(ext(relPath))) return false;
  return true;
}

/** Cheap binary sniff: lots of NUL bytes / control chars => not text. */
export function looksBinary(text: string): boolean {
  const sample = text.slice(0, 4000);
  let control = 0;
  for (let i = 0; i < sample.length; i++) {
    const c = sample.charCodeAt(i);
    if (c === 0) return true;
    if (c < 9 || (c > 13 && c < 32)) control++;
  }
  return control / Math.max(1, sample.length) > 0.1;
}

function readAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsText(file);
  });
}

/**
 * Collect a FileList (from <input type=file> or webkitdirectory / drop).
 * Uses webkitRelativePath when available so folder structure is preserved.
 */
export async function collectFiles(fileList: File[]): Promise<CollectResult> {
  const files: Record<string, string> = {};
  const skipped: string[] = [];
  for (const file of fileList) {
    const rel =
      (file as File & { webkitRelativePath?: string }).webkitRelativePath ||
      file.name;
    if (!shouldKeep(rel)) {
      skipped.push(rel);
      continue;
    }
    if (file.size > MAX_FILE_BYTES) {
      skipped.push(`${rel} (too large)`);
      continue;
    }
    try {
      const text = await readAsText(file);
      if (looksBinary(text)) {
        skipped.push(`${rel} (binary)`);
        continue;
      }
      files[rel] = text;
    } catch {
      skipped.push(`${rel} (unreadable)`);
    }
  }
  return { files, skipped };
}

/** Drop-event helper: flatten a DataTransfer into a File[]. */
export function filesFromDataTransfer(dt: DataTransfer): File[] {
  // For webkitdirectory-style drops the FileList already carries relative paths.
  return Array.from(dt.files);
}
