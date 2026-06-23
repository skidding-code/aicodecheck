import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import type { AnalysisResult } from "../types";
import { ClassificationChip, Meter } from "./ui";
import { pct, probabilityColor } from "../lib/format";

export function Headline({ result }: { result: AnalysisResult }) {
  const ai = result.overall_ai_probability ?? 0;
  const human = result.human_probability ?? 1 - ai;
  const confidence = result.confidence ?? 0;
  const lowConfidence = confidence < 0.45;

  const donutData = [
    { name: "ai", value: Math.max(0.0001, ai) },
    { name: "rest", value: Math.max(0.0001, 1 - ai) },
  ];
  const color = probabilityColor(ai);

  return (
    <div className="card">
      <div className="grid grid-cols-1 items-center gap-6 lg:grid-cols-[auto,1fr]">
        <div className="relative mx-auto h-44 w-44">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={donutData}
                dataKey="value"
                innerRadius={62}
                outerRadius={84}
                startAngle={90}
                endAngle={-270}
                stroke="none"
              >
                <Cell fill={color} />
                <Cell fill="#1c2440" />
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-3xl font-bold" style={{ color }}>
              {pct(ai)}
            </span>
            <span className="text-[10px] uppercase tracking-widest text-slate-500">
              AI probability
            </span>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <ClassificationChip value={result.classification} />
            <span className="text-sm text-slate-400">
              {result.target?.name}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Meter
              label="Confidence"
              value={confidence}
              color={lowConfidence ? "bg-slate-500" : "bg-brand-500"}
            />
            <Meter
              label="Human probability"
              value={human}
              color="bg-emerald-500"
            />
          </div>

          {lowConfidence && (
            <div className="rounded-lg border border-slate-500/40 bg-slate-500/10 px-4 py-3 text-sm text-slate-300">
              <strong className="font-semibold text-slate-100">
                Low confidence.
              </strong>{" "}
              The signal is weak or conflicting — treat this result as
              inconclusive rather than a verdict.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
