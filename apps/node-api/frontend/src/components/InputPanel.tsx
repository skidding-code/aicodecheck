import { useRef, useState } from "react";
import { api } from "../api";
import type { AnalysisResult } from "../types";
import { readFileAsText, readFolderFiles } from "../lib/files";
import { pollJobToReport, type PollProgress } from "../lib/poll";
import { Card, ErrorBanner, ProgressBar, Spinner } from "./ui";

type InputTab = "repo" | "snippet" | "file" | "folder" | "zip";

const TABS: { key: InputTab; label: string }[] = [
  { key: "repo", label: "GitHub Repo" },
  { key: "snippet", label: "Snippet" },
  { key: "file", label: "File" },
  { key: "folder", label: "Folder" },
  { key: "zip", label: "ZIP" },
];

const LANGUAGES = [
  "",
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
  "kotlin",
  "swift",
];

export function InputPanel({
  onResult,
}: {
  onResult: (r: AnalysisResult) => void;
}) {
  const [tab, setTab] = useState<InputTab>("repo");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<PollProgress | null>(null);

  function run(fn: () => Promise<AnalysisResult>) {
    setBusy(true);
    setError(null);
    setProgress(null);
    fn()
      .then((r) => onResult(r))
      .catch((e) => setError((e as Error).message))
      .finally(() => {
        setBusy(false);
        setProgress(null);
      });
  }

  return (
    <Card>
      <div className="mb-4 flex flex-wrap gap-1 rounded-lg border border-ink-700 bg-ink-900 p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            disabled={busy}
            onClick={() => {
              setTab(t.key);
              setError(null);
            }}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
              tab === t.key
                ? "bg-brand-500 text-white"
                : "text-slate-400 hover:bg-ink-700 hover:text-slate-200"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-4">
          <ErrorBanner message={error} />
        </div>
      )}

      {busy && (
        <div className="mb-4 space-y-2">
          <Spinner
            label={
              progress
                ? `Status: ${progress.status}`
                : "Analyzing… this may take a moment"
            }
          />
          {progress && <ProgressBar value={progress.progress} />}
        </div>
      )}

      <fieldset disabled={busy} className="space-y-4">
        {tab === "repo" && <RepoForm run={run} setProgress={setProgress} />}
        {tab === "snippet" && <SnippetForm run={run} />}
        {tab === "file" && <FileForm run={run} />}
        {tab === "folder" && <FolderForm run={run} />}
        {tab === "zip" && <ZipForm run={run} setProgress={setProgress} />}
      </fieldset>
    </Card>
  );
}

type RunFn = (fn: () => Promise<AnalysisResult>) => void;
type SetProgress = (p: PollProgress) => void;

function RepoForm({
  run,
  setProgress,
}: {
  run: RunFn;
  setProgress: SetProgress;
}) {
  const [repository, setRepository] = useState("");
  const [token, setToken] = useState("");
  const [ref, setRef] = useState("");

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!repository.trim()) return;
        run(async () => {
          const job = await api.analyzeRepository({
            repository: repository.trim(),
            token: token.trim() || undefined,
            ref: ref.trim() || undefined,
            async_job: true,
          });
          return pollJobToReport(job.job_id, setProgress);
        });
      }}
    >
      <div>
        <label className="label">Repository (URL or owner/repo)</label>
        <input
          className="input"
          placeholder="https://github.com/owner/repo or owner/repo"
          value={repository}
          onChange={(e) => setRepository(e.target.value)}
        />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="label">Access token (optional, private repos)</label>
          <input
            className="input"
            type="password"
            placeholder="ghp_…"
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
        </div>
        <div>
          <label className="label">Ref / branch (optional)</label>
          <input
            className="input"
            placeholder="main"
            value={ref}
            onChange={(e) => setRef(e.target.value)}
          />
        </div>
      </div>
      <button className="btn-primary" type="submit" disabled={!repository.trim()}>
        Analyze repository
      </button>
      <p className="text-xs text-slate-500">
        Repository analysis runs asynchronously and progress is polled below.
      </p>
    </form>
  );
}

function SnippetForm({ run }: { run: RunFn }) {
  const [code, setCode] = useState("");
  const [filename, setFilename] = useState("snippet.txt");
  const [language, setLanguage] = useState("");

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!code.trim()) return;
        run(() =>
          api.analyzeSnippet(code, filename || "snippet.txt", language || undefined),
        );
      }}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="label">Filename</label>
          <input
            className="input"
            value={filename}
            onChange={(e) => setFilename(e.target.value)}
          />
        </div>
        <div>
          <label className="label">Language</label>
          <select
            className="input"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
          >
            {LANGUAGES.map((l) => (
              <option key={l} value={l}>
                {l || "auto-detect"}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="label">Code</label>
        <textarea
          className="input min-h-[220px] font-mono text-xs"
          placeholder="Paste code here…"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
      </div>
      <button className="btn-primary" type="submit" disabled={!code.trim()}>
        Analyze snippet
      </button>
    </form>
  );
}

function FileForm({ run }: { run: RunFn }) {
  const [filename, setFilename] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setFilename(file.name);
    const content = await readFileAsText(file);
    run(() => api.analyzeFile(file.name, content));
  }

  return (
    <div className="space-y-4">
      <DropZone
        onFiles={(files) => files[0] && handleFile(files[0])}
        hint="Drop a single source file here, or click to browse"
        onClick={() => inputRef.current?.click()}
      />
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
        }}
      />
      {filename && (
        <p className="text-xs text-slate-500">Selected: {filename}</p>
      )}
    </div>
  );
}

function FolderForm({ run }: { run: RunFn }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [summary, setSummary] = useState<string | null>(null);

  async function handleList(list: FileList) {
    const { files, skipped, rootName } = await readFolderFiles(list);
    const n = Object.keys(files).length;
    setSummary(`${n} files queued, ${skipped} skipped (ignored/binary/large)`);
    if (n === 0) return;
    run(() => api.analyzeFolder(files, rootName));
  }

  return (
    <div className="space-y-4">
      <DropZone
        hint="Click to select a folder (vendor/build dirs are ignored)"
        onClick={() => inputRef.current?.click()}
        onFiles={() => {
          /* drag-drop of folders is unreliable across browsers; use picker */
        }}
        dropDisabled
      />
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        // @ts-expect-error non-standard but widely supported attributes
        webkitdirectory=""
        directory=""
        multiple
        onChange={(e) => {
          if (e.target.files && e.target.files.length) handleList(e.target.files);
        }}
      />
      {summary && <p className="text-xs text-slate-500">{summary}</p>}
      <p className="text-xs text-slate-500">
        Files are read in your browser; node_modules, .git, dist and similar are
        skipped automatically.
      </p>
    </div>
  );
}

function ZipForm({
  run,
  setProgress,
}: {
  run: RunFn;
  setProgress: SetProgress;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState<string | null>(null);

  function handleFile(file: File) {
    setName(file.name);
    run(async () => {
      const job = await api.analyzeZip(file);
      return pollJobToReport(job.job_id, setProgress);
    });
  }

  return (
    <div className="space-y-4">
      <DropZone
        hint="Drop a .zip archive here, or click to browse"
        onClick={() => inputRef.current?.click()}
        onFiles={(files) => files[0] && handleFile(files[0])}
        accept=".zip"
      />
      <input
        ref={inputRef}
        type="file"
        accept=".zip,application/zip"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
        }}
      />
      {name && <p className="text-xs text-slate-500">Selected: {name}</p>}
      <p className="text-xs text-slate-500">
        ZIP analysis runs asynchronously and progress is polled below.
      </p>
    </div>
  );
}

function DropZone({
  hint,
  onClick,
  onFiles,
  accept,
  dropDisabled,
}: {
  hint: string;
  onClick: () => void;
  onFiles: (files: File[]) => void;
  accept?: string;
  dropDisabled?: boolean;
}) {
  const [over, setOver] = useState(false);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onClick()}
      onDragOver={(e) => {
        if (dropDisabled) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        if (dropDisabled) return;
        e.preventDefault();
        setOver(false);
        const files = Array.from(e.dataTransfer.files);
        if (files.length) onFiles(files);
      }}
      className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-12 text-center transition ${
        over
          ? "border-brand-400 bg-brand-500/10"
          : "border-ink-600 bg-ink-900/40 hover:border-ink-500"
      }`}
    >
      <div className="text-3xl text-slate-500">⬆</div>
      <div className="text-sm text-slate-300">{hint}</div>
      {accept && <div className="text-xs text-slate-500">Accepts {accept}</div>}
    </div>
  );
}
