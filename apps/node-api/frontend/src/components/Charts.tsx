import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type {
  ContributorActivityEntry,
  PieEntry,
  SignalBreakdownEntry,
  VizCommitTimeline,
} from "../types";
import { Card, EmptyState } from "./ui";
import { shortDate } from "../lib/format";

const PIE_COLORS = ["#34d399", "#38bdf8", "#fbbf24", "#fb7185", "#94a3b8", "#a78bfa"];

const tooltipStyle = {
  background: "#0f1528",
  border: "1px solid #28324f",
  borderRadius: 8,
  fontSize: 12,
  color: "#e2e8f0",
};

export function ClassificationPie({ data }: { data?: PieEntry[] }) {
  const items = (data ?? []).filter((d) => d.value > 0);
  return (
    <Card title="Classification distribution">
      {items.length === 0 ? (
        <EmptyState>No distribution data.</EmptyState>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <PieChart>
            <Pie
              data={items}
              dataKey="value"
              nameKey="label"
              outerRadius={90}
              label={(e) => e.label}
            >
              {items.map((_, i) => (
                <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip contentStyle={tooltipStyle} />
          </PieChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}

export function SignalBreakdown({ data }: { data?: SignalBreakdownEntry[] }) {
  // Plot deviation from neutral 0.5 so AI-leaning vs human-leaning is visible.
  const items = (data ?? [])
    .map((d) => ({
      signal: d.signal,
      deviation: Number((d.mean_score - 0.5).toFixed(3)),
      count: d.count,
      confidence: d.mean_confidence,
    }))
    .sort((a, b) => Math.abs(b.deviation) - Math.abs(a.deviation))
    .slice(0, 14);

  return (
    <Card title="Signal breakdown (deviation from neutral)">
      {items.length === 0 ? (
        <EmptyState>No signal data.</EmptyState>
      ) : (
        <ResponsiveContainer width="100%" height={Math.max(260, items.length * 26)}>
          <BarChart data={items} layout="vertical" margin={{ left: 20, right: 20 }}>
            <XAxis
              type="number"
              domain={[-0.5, 0.5]}
              tick={{ fill: "#94a3b8", fontSize: 11 }}
              tickFormatter={(v) => `${v > 0 ? "+" : ""}${v}`}
            />
            <YAxis
              type="category"
              dataKey="signal"
              width={150}
              tick={{ fill: "#94a3b8", fontSize: 11 }}
            />
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(v: number) => [
                `${v > 0 ? "+" : ""}${v} (${v > 0 ? "AI-leaning" : "human-leaning"})`,
                "deviation",
              ]}
            />
            <Bar dataKey="deviation" radius={[0, 4, 4, 0]}>
              {items.map((d, i) => (
                <Cell key={i} fill={d.deviation >= 0 ? "#fb7185" : "#34d399"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}

export function CommitTimeline({ data }: { data?: VizCommitTimeline[] }) {
  const items = (data ?? [])
    .slice()
    .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""))
    .map((d) => ({
      date: shortDate(d.date),
      insertions: d.insertions ?? 0,
      deletions: d.deletions ?? 0,
    }));

  return (
    <Card title="Commit timeline">
      {items.length === 0 ? (
        <EmptyState>No commit history available.</EmptyState>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={items} margin={{ left: 0, right: 12 }}>
            <defs>
              <linearGradient id="ins" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#4d8bff" stopOpacity={0.6} />
                <stop offset="100%" stopColor="#4d8bff" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="date" tick={{ fill: "#94a3b8", fontSize: 11 }} />
            <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} />
            <Tooltip contentStyle={tooltipStyle} />
            <Area
              type="monotone"
              dataKey="insertions"
              stroke="#4d8bff"
              fill="url(#ins)"
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}

export function ContributorActivity({
  data,
}: {
  data?: ContributorActivityEntry[];
}) {
  const items = (data ?? [])
    .map((d) => ({
      name: String(d.name ?? d.author ?? "unknown"),
      commits: Number(d.commits ?? 0),
    }))
    .sort((a, b) => b.commits - a.commits)
    .slice(0, 12);

  return (
    <Card title="Contributor activity">
      {items.length === 0 ? (
        <EmptyState>No contributor data.</EmptyState>
      ) : (
        <ResponsiveContainer width="100%" height={Math.max(220, items.length * 26)}>
          <BarChart data={items} layout="vertical" margin={{ left: 20, right: 20 }}>
            <XAxis type="number" tick={{ fill: "#94a3b8", fontSize: 11 }} />
            <YAxis
              type="category"
              dataKey="name"
              width={130}
              tick={{ fill: "#94a3b8", fontSize: 11 }}
            />
            <Tooltip contentStyle={tooltipStyle} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="commits" fill="#6ea8fe" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}
