import { Card } from "../components/ui";

export function AboutPage() {
  return (
    <div className="space-y-5">
      <Card title="What this is">
        <p className="text-sm leading-relaxed text-slate-300">
          The AI Project Detector estimates the likelihood that code was authored
          or assisted by AI tools. It aggregates multiple weighted detectors
          across files, folders, commit history, and contributor patterns to
          produce a single probabilistic estimate with a confidence level.
        </p>
      </Card>

      <Card title="Methodology (summary)">
        <ul className="space-y-2 text-sm text-slate-300">
          <li>• Source is collected from a snippet, file, folder, ZIP, or GitHub repository.</li>
          <li>• Per-entity detectors emit signals (a score, weight, and confidence) with human-readable reasons.</li>
          <li>• Signals are combined into an AI probability, a human probability, a confidence, and a classification.</li>
          <li>• Where git history is available, commit cadence and contributor patterns add further signal.</li>
          <li>• Visualizations (heatmaps, similarity, dependency graph) help locate where the signal concentrates.</li>
        </ul>
      </Card>

      <Card title="Limitations">
        <ul className="space-y-2 text-sm text-slate-300">
          <li>• Detection is probabilistic and can be wrong in both directions (false positives and false negatives).</li>
          <li>• Human-written code can look "AI-like" (clean, idiomatic, well-commented) and vice versa.</li>
          <li>• Model/source attribution is experimental and especially unreliable.</li>
          <li>• Small inputs carry low confidence; short snippets are easily misclassified.</li>
          <li>• Results can be gamed and should never be the sole basis for a decision about a person.</li>
        </ul>
      </Card>

      <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-5 text-sm text-amber-200">
        <strong className="font-semibold">Disclaimer.</strong> This tool provides
        estimates, not proof. AI detection is inherently uncertain. Do not use
        these results to accuse, penalize, or make high-stakes decisions about any
        individual. Treat every output as one weak signal among many.
      </div>
    </div>
  );
}
