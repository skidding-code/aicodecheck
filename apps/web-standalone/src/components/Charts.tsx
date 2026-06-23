import type { AnalysisResult } from "@aicodecheck/detector-core";
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { Card } from "./ui";
import { heatColor } from "../lib/format";

const PIE_COLORS: Record<string, string> = {
  likely_human: "#34d399",
  possibly_ai_assisted: "#fbbf24",
  likely_ai_assisted: "#fb923c",
  likely_ai_generated: "#fb7185",
  uncertain: "#94a3b8",
};

export function ClassificationPie({ result }: { result: AnalysisResult }) {
  const data = (result.visualizations.classification_pie as Array<{
    label: string;
    value: number;
  }>).filter((d) => d.value > 0);

  if (!data.length) {
    return (
      <Card title="Classification mix">
        <Empty>No per-file classifications.</Empty>
      </Card>
    );
  }

  return (
    <Card title="Classification mix">
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="label" outerRadius={80} label>
              {data.map((d) => (
                <Cell key={d.label} fill={PIE_COLORS[d.label] ?? "#94a3b8"} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{ background: "#0f1528", border: "1px solid #1c2440" }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 flex flex-wrap gap-3 text-xs">
        {data.map((d) => (
          <span key={d.label} className="flex items-center gap-1.5 text-slate-300">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ background: PIE_COLORS[d.label] ?? "#94a3b8" }}
            />
            {d.label.replace(/_/g, " ")} ({d.value})
          </span>
        ))}
      </div>
    </Card>
  );
}

export function SignalBreakdown({ result }: { result: AnalysisResult }) {
  const data = (result.visualizations.signal_breakdown as Array<{
    signal: string;
    mean_score: number;
    count: number;
    mean_confidence: number;
  }>)
    .slice()
    .sort((a, b) => b.mean_score - a.mean_score)
    .slice(0, 14);

  if (!data.length) {
    return (
      <Card title="Signal breakdown">
        <Empty>No informative signals fired.</Empty>
      </Card>
    );
  }

  return (
    <Card title="Signal breakdown (mean score, 0.5 = neutral)">
      <div style={{ height: Math.max(220, data.length * 26) }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ left: 10, right: 16, top: 4, bottom: 4 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#1c2440" horizontal={false} />
            <XAxis
              type="number"
              domain={[0, 1]}
              stroke="#64748b"
              tick={{ fontSize: 11 }}
            />
            <YAxis
              type="category"
              dataKey="signal"
              width={150}
              stroke="#64748b"
              tick={{ fontSize: 11 }}
              tickFormatter={(v: string) => v.replace(/_/g, " ")}
            />
            <Tooltip
              contentStyle={{ background: "#0f1528", border: "1px solid #1c2440" }}
              formatter={(v: number, _n, item) => [
                `${(v as number).toFixed(2)} · ${(item.payload.count)}× · conf ${(
                  item.payload.mean_confidence as number
                ).toFixed(2)}`,
                "mean score",
              ]}
            />
            <Bar dataKey="mean_score" radius={[0, 4, 4, 0]}>
              {data.map((d) => (
                <Cell key={d.signal} fill={heatColor(d.mean_score)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-slate-500">{children}</p>;
}
