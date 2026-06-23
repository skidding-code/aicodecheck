import { Card } from "./ui";
import { PrivacyBadge } from "./DisclaimerBanner";

export function About() {
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Card title="What this is">
        <p className="text-sm leading-relaxed text-slate-300">
          The AI Project Detector is a probabilistic estimator of how
          AI-generated a piece of code, a folder, or a whole repository
          <em> looks</em>. This is the <strong>backend-free edition</strong>: the
          entire detection engine is compiled to JavaScript and runs inside your
          browser, off the main thread in a Web Worker.
        </p>
        <div className="mt-3">
          <PrivacyBadge />
        </div>
      </Card>

      <Card title="The privacy advantage">
        <p className="text-sm leading-relaxed text-slate-300">
          Because there is no server, <strong>your code never leaves your
          browser tab.</strong> Pasted snippets, chosen files, dropped folders
          and uploaded ZIPs are read with the browser&apos;s FileReader and
          decompressed locally; they are passed straight to the in-page Web
          Worker and never uploaded anywhere. The single optional exception is
          the GitHub fetch, which downloads <em>public</em> source from GitHub
          directly into your browser — even then, the analysis itself stays
          local.
        </p>
      </Card>

      <Card title="How it works (methodology)">
        <ul className="space-y-2 text-sm leading-relaxed text-slate-300">
          <li>
            <strong>Ingestion.</strong> Inputs become a map of file paths to text.
            Vendored directories, lockfiles, binaries and large files are skipped.
          </li>
          <li>
            <strong>Detectors.</strong> Independent heuristics each emit calibrated
            0–1 signals (0.5 = no information): code structure &amp; repetition,
            stylometry (naming/formatting), token entropy &amp; complexity
            regularity, LLM &ldquo;fingerprints&rdquo; (narration comments,
            placeholders, over-documentation), and README/documentation style.
          </li>
          <li>
            <strong>Ensemble.</strong> Signals are combined into a single
            probability plus an independent <em>confidence</em> based on how much
            evidence exists and how much the signals agree.
          </li>
          <li>
            <strong>Reporting.</strong> Results are bucketed into hedged
            classifications, with per-file/per-folder heatmaps, evidence, and
            speculative tool attribution.
          </li>
        </ul>
      </Card>

      <Card title="Limitations — please read">
        <ul className="space-y-2 text-sm leading-relaxed text-amber-200/90">
          <li>
            These are <strong>estimates, not proof.</strong> There are real
            false-positive and false-negative rates. <em>Uncertain</em> is a
            valid, common outcome.
          </li>
          <li>
            Auto-formatters, linters, shared style guides and boilerplate make
            human code look &ldquo;AI-clean&rdquo;; skilled prompting makes AI code
            look human. Both directions are easy to fool.
          </li>
          <li>
            No git history is available in the browser, so commit-timeline and
            contributor behavior signals are absent here.
          </li>
          <li>
            <strong>Never use this to accuse, grade, discipline, or penalize a
            person.</strong> It is a triage and curiosity aid, nothing more.
          </li>
        </ul>
      </Card>

      <Card title="GitHub fetch caveats">
        <p className="text-sm leading-relaxed text-slate-300">
          In-browser repo fetching works only for <strong>public</strong>
          repositories and may be blocked by GitHub&apos;s CORS policy or by API
          rate limits. The app first tries the codeload tarball and falls back to
          the REST API + raw contents. An optional personal access token (kept in
          memory only, never persisted) raises rate limits. If a fetch fails, the
          most reliable path is to download the repository ZIP from GitHub and use
          the ZIP tab.
        </p>
      </Card>
    </div>
  );
}
