import { useMemo } from "react";
import type { AnalysisResult } from "../types";
import { Card, EmptyState } from "./ui";

// Lightweight SVG graph: nodes placed on a circle, edges drawn as lines.
export function DependencyGraphView({ result }: { result: AnalysisResult }) {
  const graph = result.visualizations?.dependency_graph;
  const nodes = graph?.nodes ?? [];
  const edges = graph?.edges ?? [];

  const layout = useMemo(() => {
    const W = 560;
    const H = 360;
    const cx = W / 2;
    const cy = H / 2;
    const radius = Math.min(W, H) / 2 - 50;
    const pos = new Map<string, { x: number; y: number }>();
    const n = nodes.length || 1;
    nodes.forEach((node, i) => {
      const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
      pos.set(node.id, {
        x: cx + radius * Math.cos(angle),
        y: cy + radius * Math.sin(angle),
      });
    });
    const maxLoc = Math.max(1, ...nodes.map((nd) => nd.loc ?? 1));
    return { W, H, pos, maxLoc };
  }, [nodes]);

  return (
    <Card title="Dependency graph">
      {nodes.length === 0 ? (
        <EmptyState>No dependency data.</EmptyState>
      ) : (
        <div className="overflow-auto">
          <svg
            viewBox={`0 0 ${layout.W} ${layout.H}`}
            className="mx-auto w-full max-w-2xl"
          >
            {edges.map((e, i) => {
              const a = layout.pos.get(e.source);
              const b = layout.pos.get(e.target);
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
            {nodes.map((nd) => {
              const p = layout.pos.get(nd.id);
              if (!p) return null;
              const r = 4 + ((nd.loc ?? 1) / layout.maxLoc) * 10;
              return (
                <g key={nd.id}>
                  <circle cx={p.x} cy={p.y} r={r} fill="#4d8bff" opacity={0.85}>
                    <title>
                      {nd.id} ({nd.language ?? "?"}, {nd.loc ?? 0} LOC)
                    </title>
                  </circle>
                  <text
                    x={p.x}
                    y={p.y - r - 3}
                    textAnchor="middle"
                    className="fill-slate-400"
                    fontSize={8}
                  >
                    {baseName(nd.id)}
                  </text>
                </g>
              );
            })}
          </svg>
          <p className="mt-2 text-center text-xs text-slate-500">
            {nodes.length} modules · {edges.length} dependencies (node size ∝ LOC)
          </p>
        </div>
      )}
    </Card>
  );
}

function baseName(id: string): string {
  const parts = id.split("/");
  return parts[parts.length - 1];
}
