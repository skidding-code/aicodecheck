import { useMemo } from "react";
import type { AnalysisResult } from "@aicodecheck/detector-core";
import { Card } from "./ui";

interface Node {
  id: string;
  language: string;
  loc: number;
}
interface Edge {
  source?: string;
  target?: string;
  from?: string;
  to?: string;
}

const LANG_COLOR: Record<string, string> = {
  python: "#4d8bff",
  javascript: "#fbbf24",
  typescript: "#38bdf8",
  java: "#fb7185",
  go: "#34d399",
  rust: "#f97316",
  markdown: "#94a3b8",
};

/** Simple force-free radial layout drawn as inline SVG. */
export function DependencyGraph({ result }: { result: AnalysisResult }) {
  const graph = result.visualizations.dependency_graph as {
    nodes?: Node[];
    edges?: Edge[];
  };
  const nodes = graph.nodes ?? [];
  const edges = graph.edges ?? [];

  const layout = useMemo(() => {
    const w = 640;
    const h = 360;
    const cx = w / 2;
    const cy = h / 2;
    const r = Math.min(w, h) / 2 - 40;
    const positions = new Map<string, { x: number; y: number }>();
    const n = nodes.length;
    nodes.forEach((node, i) => {
      const angle = (i / Math.max(1, n)) * Math.PI * 2 - Math.PI / 2;
      positions.set(node.id, {
        x: cx + r * Math.cos(angle),
        y: cy + r * Math.sin(angle),
      });
    });
    return { w, h, positions };
  }, [nodes]);

  if (!nodes.length) {
    return (
      <Card title="Dependency graph">
        <p className="text-sm text-slate-500">No module graph available.</p>
      </Card>
    );
  }

  return (
    <Card title={`Dependency graph (${nodes.length} modules, ${edges.length} edges)`}>
      <div className="overflow-auto">
        <svg
          viewBox={`0 0 ${layout.w} ${layout.h}`}
          className="h-[360px] w-full"
          role="img"
          aria-label="Module dependency graph"
        >
          {edges.map((e, i) => {
            const from = e.source ?? e.from;
            const to = e.target ?? e.to;
            const a = from ? layout.positions.get(from) : undefined;
            const b = to ? layout.positions.get(to) : undefined;
            if (!a || !b) return null;
            return (
              <line
                key={i}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke="#28324f"
                strokeWidth={1}
              />
            );
          })}
          {nodes.map((node) => {
            const p = layout.positions.get(node.id);
            if (!p) return null;
            const radius = 5 + Math.min(14, Math.sqrt(node.loc));
            const label = node.id.split("/").pop() ?? node.id;
            return (
              <g key={node.id}>
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={radius}
                  fill={LANG_COLOR[node.language] ?? "#6ea8fe"}
                  fillOpacity={0.85}
                />
                <title>{`${node.id} (${node.language}, ${node.loc} LOC)`}</title>
                <text
                  x={p.x}
                  y={p.y + radius + 10}
                  textAnchor="middle"
                  fontSize={9}
                  fill="#94a3b8"
                >
                  {label.length > 18 ? label.slice(0, 17) + "…" : label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </Card>
  );
}
