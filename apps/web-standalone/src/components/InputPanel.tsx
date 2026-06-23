import { useRef, useState } from "react";
import { Card, Tabs } from "./ui";
import { collectFiles, filesFromDataTransfer, type CollectResult } from "../lib/collect";
import { extractZipFile } from "../lib/zip";
import { parseRepoInput, fetchRepo } from "../lib/github";

type Mode = "snippet" | "files" | "folder" | "zip" | "github";

const LANGUAGES = [
  "auto",
  "python",
  "javascript",
  "typescript",
  "java",
  "go",
  "rust",
  "c",
  "cpp",
  "csharp",
  "ruby",
  "php",
  "swift",
  "kotlin",
  "markdown",
];

const SAMPLE = `def calculate_total(items):
    # Calculate the total price of all items in the list
    total = 0
    for item in items:
        # Add the price of the current item to the total
        total += item.price
    # Return the final total
    return total
`;

export interface AnalyzeRequest {
  kind: "snippet" | "files";
  // snippet:
  code?: string;
  filename?: string;
  language?: string | null;
  // files:
  files?: Record<string, string>;
  // metadata for the UI
  label: string;
  note?: string;
  skipped?: string[];
}

export function InputPanel({
  busy,
  onAnalyze,
  onError,
}: {
  busy: boolean;
  onAnalyze: (req: AnalyzeRequest) => void;
  onError: (msg: string) => void;
}) {
  const [mode, setMode] = useState<Mode>("snippet");

  return (
    <Card title="Input">
      <Tabs<Mode>
        active={mode}
        onChange={setMode}
        tabs={[
          { id: "snippet", label: "Snippet" },
          { id: "files", label: "Files" },
          { id: "folder", label: "Folder" },
          { id: "zip", label: "ZIP" },
          { id: "github", label: "GitHub" },
        ]}
      />
      <div className="mt-4">
        {mode === "snippet" && (
          <SnippetInput busy={busy} onAnalyze={onAnalyze} />
        )}
        {mode === "files" && (
          <FilePicker busy={busy} onAnalyze={onAnalyze} onError={onError} directory={false} />
        )}
        {mode === "folder" && (
          <FolderDrop busy={busy} onAnalyze={onAnalyze} onError={onError} />
        )}
        {mode === "zip" && (
          <ZipInput busy={busy} onAnalyze={onAnalyze} onError={onError} />
        )}
        {mode === "github" && (
          <GithubInput busy={busy} onAnalyze={onAnalyze} onError={onError} />
        )}
      </div>
    </Card>
  );
}

// --------------------------------------------------------------------------- //

function SnippetInput({
  busy,
  onAnalyze,
}: {
  busy: boolean;
  onAnalyze: (req: AnalyzeRequest) => void;
}) {
  const [code, setCode] = useState(SAMPLE);
  const [language, setLanguage] = useState("auto");

  function submit() {
    if (!code.trim()) return;
    onAnalyze({
      kind: "snippet",
      code,
      language: language === "auto" ? null : language,
      filename: language === "auto" ? "snippet.txt" : undefined,
      label: "Pasted snippet",
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="label">Language</label>
          <select
            className="input w-44"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
          >
            {LANGUAGES.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <button className="btn-ghost" onClick={() => setCode("")}>
          Clear
        </button>
      </div>
      <textarea
        className="input min-h-[240px] font-mono text-xs leading-relaxed"
        spellCheck={false}
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="Paste code here…"
      />
      <button className="btn-primary" disabled={busy || !code.trim()} onClick={submit}>
        {busy ? "Analyzing…" : "Analyze snippet"}
      </button>
    </div>
  );
}

function summarize(result: CollectResult): string {
  const kept = Object.keys(result.files).length;
  return `${kept} file${kept === 1 ? "" : "s"} collected, ${result.skipped.length} skipped`;
}

function FilePicker({
  busy,
  onAnalyze,
  onError,
  directory,
}: {
  busy: boolean;
  onAnalyze: (req: AnalyzeRequest) => void;
  onError: (msg: string) => void;
  directory: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const list = e.target.files ? Array.from(e.target.files) : [];
    if (!list.length) return;
    try {
      const collected = await collectFiles(list);
      if (!Object.keys(collected.files).length) {
        onError("No analyzable text files were found in your selection.");
        return;
      }
      onAnalyze({
        kind: "files",
        files: collected.files,
        skipped: collected.skipped,
        label: directory ? "Selected folder" : "Selected files",
        note: summarize(collected),
      });
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-400">
        Choose individual files. They are read locally with FileReader — nothing is uploaded.
      </p>
      <input
        ref={ref}
        type="file"
        multiple
        // @ts-expect-error non-standard but supported attribute
        webkitdirectory={directory ? "" : undefined}
        onChange={onChange}
        className="block w-full text-sm text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-500 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-brand-600"
        disabled={busy}
      />
    </div>
  );
}

function FolderDrop({
  busy,
  onAnalyze,
  onError,
}: {
  busy: boolean;
  onAnalyze: (req: AnalyzeRequest) => void;
  onError: (msg: string) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  async function handle(files: File[]) {
    if (!files.length) return;
    try {
      const collected = await collectFiles(files);
      if (!Object.keys(collected.files).length) {
        onError("No analyzable text files were found (binaries, node_modules, etc. are skipped).");
        return;
      }
      onAnalyze({
        kind: "files",
        files: collected.files,
        skipped: collected.skipped,
        label: "Dropped folder",
        note: summarize(collected),
      });
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          handle(filesFromDataTransfer(e.dataTransfer));
        }}
        className={`grid place-items-center rounded-xl border-2 border-dashed px-6 py-12 text-center transition ${
          dragging ? "border-brand-500 bg-brand-500/5" : "border-ink-600 bg-ink-900"
        }`}
      >
        <p className="text-sm text-slate-300">Drag &amp; drop a folder here</p>
        <p className="mt-1 text-xs text-slate-500">
          node_modules, .git, dist, vendor, build, target, lockfiles, binaries and
          files &gt; 2&nbsp;MB are skipped. Recursively read in-browser.
        </p>
        <button
          className="btn-ghost mt-4"
          disabled={busy}
          onClick={() => ref.current?.click()}
        >
          …or browse for a folder
        </button>
        <input
          ref={ref}
          type="file"
          multiple
          // @ts-expect-error webkitdirectory is non-standard
          webkitdirectory=""
          className="hidden"
          onChange={(e) => handle(e.target.files ? Array.from(e.target.files) : [])}
        />
      </div>
    </div>
  );
}

function ZipInput({
  busy,
  onAnalyze,
  onError,
}: {
  busy: boolean;
  onAnalyze: (req: AnalyzeRequest) => void;
  onError: (msg: string) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);

  async function handle(file: File | undefined) {
    if (!file) return;
    try {
      const collected = await extractZipFile(file);
      if (!Object.keys(collected.files).length) {
        onError("The ZIP contained no analyzable text files.");
        return;
      }
      onAnalyze({
        kind: "files",
        files: collected.files,
        skipped: collected.skipped,
        label: `ZIP: ${file.name}`,
        note: summarize(collected),
      });
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-400">
        Upload a <span className="font-mono">.zip</span>. It is extracted entirely in
        your browser (via fflate) with zip-bomb and path-traversal guards — nothing is uploaded.
      </p>
      <input
        ref={ref}
        type="file"
        accept=".zip,application/zip"
        onChange={(e) => handle(e.target.files?.[0])}
        className="block w-full text-sm text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-500 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-brand-600"
        disabled={busy}
      />
    </div>
  );
}

function GithubInput({
  busy,
  onAnalyze,
  onError,
}: {
  busy: boolean;
  onAnalyze: (req: AnalyzeRequest) => void;
  onError: (msg: string) => void;
}) {
  const [value, setValue] = useState("");
  const [token, setToken] = useState("");
  const [fetching, setFetching] = useState(false);

  async function submit() {
    const ref = parseRepoInput(value);
    if (!ref) {
      onError("Enter a repo as owner/repo, owner/repo@branch, or a github.com URL.");
      return;
    }
    setFetching(true);
    try {
      const out = await fetchRepo(ref, token.trim() || undefined);
      onAnalyze({
        kind: "files",
        files: out.files,
        skipped: out.skipped,
        label: `${out.ref.owner}/${out.ref.repo}@${out.ref.branch}`,
        note: `Fetched ${Object.keys(out.files).length} files via ${out.via} (no git history available in-browser).`,
      });
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setFetching(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
        Best-effort, in-browser fetch of <strong>public</strong> repos only. It may be
        blocked by GitHub CORS or rate limits. If it fails, download the repo ZIP and use
        the ZIP tab. No git history is available in the browser, so commit/contributor
        signals will be absent.
      </div>
      <div>
        <label className="label">Repository</label>
        <input
          className="input"
          placeholder="owner/repo  ·  owner/repo@branch  ·  https://github.com/owner/repo"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={busy || fetching}
        />
      </div>
      <div>
        <label className="label">Personal access token (optional, kept in memory only)</label>
        <input
          className="input"
          type="password"
          placeholder="ghp_… — raises rate limits; never stored or sent anywhere but GitHub"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          disabled={busy || fetching}
        />
      </div>
      <button
        className="btn-primary"
        disabled={busy || fetching || !value.trim()}
        onClick={submit}
      >
        {fetching ? "Fetching repo…" : busy ? "Analyzing…" : "Fetch & analyze"}
      </button>
    </div>
  );
}
