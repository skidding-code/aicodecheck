import type { AnalysisResult } from "@aicodecheck/detector-core";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { Card, Meter } from "./ui";
import {
  pct,
  CLASSIFICATION_LABEL,
  classificationChip,
  heatColor,
  readableConfidence,
  downloadJson,
} from "../lib/format";

export function Headline({ result }: { result: AnalysisResult }) {
  const p = result.overall_ai_probability;
  const donut = [
    { name: "ai", value: p },
    { name: "human", value: 1 - p },
  ];

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-8">
        {/* Donut gauge */}
        <div className="relative h-40 w-40 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={donut}
                dataKey="value"
                innerRadius={52}
                outerRadius={72}
                startAngle={90}
                endAngle={-270}
                stroke="none"
              >
                <Cell fill={heatColor(p)} />
                <Cell fill="#1c2440" />
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <div className="text-center">
              <div className="font-mono text-3xl font-bold" style={{ color: heatColor(p) }}>
                {pct(p)}
              </div>
              <div className="text-[10px] uppercase tracking-wider text-slate-500">
                est. AI prob.
              </div>
            </div>
          </div>
        </div>

        {/* Verdict + meters */}
        <div className="min-w-[260px] flex-1 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className={`chip text-sm ${classificationChip(result.classification)}`}>
              {CLASSIFICATION_LABEL[result.classification]}
            </span>
            <span className="text-xs text-slate-400">
              confidence: {readableConfidence(result.confidence)}
            </span>
          </div>

          <Meter
            label="Estimated AI probability"
            value={result.overall_ai_probability}
            color={heatColor(result.overall_ai_probability)}
          />
          <Meter
            label="Human probability"
            value={result.human_probability}
            color="#34d399"
          />
          <Meter
            label="Confidence"
            value={result.confidence}
            color="#6ea8fe"
            caption="How much concrete evidence backs this verdict. Low confidence means treat the number as little more than a guess."
          />
        </div>

        <div className="flex flex-col gap-2">
          <button
            className="btn-ghost"
            onClick={() =>
              downloadJson(result, `analysis-${result.id || "result"}.json`)
            }
          >
            Download JSON
          </button>
          <span className="max-w-[180px] text-[11px] text-slate-500">
            {result.target.analyzed_files} files · {result.target.total_loc} LOC analyzed
          </span>
        </div>
      </div>

      <p className="mt-4 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-200/90">
        This is a probabilistic estimate, not proof. A high number is not evidence that
        any specific person used AI, and a low number does not certify human authorship.
      </p>
    </Card>
  );
}
