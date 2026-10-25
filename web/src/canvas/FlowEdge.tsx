import { BaseEdge, EdgeLabelRenderer, getBezierPath, type Edge, type EdgeProps } from "@xyflow/react";
import type { Edge as AEdge } from "../../../src/shared/analysis";

export type FlowEdgeData = { edge: AEdge; active: boolean; dimmed: boolean };

export function FlowEdge(props: EdgeProps<Edge<FlowEdgeData>>) {
  const { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, markerEnd } = props;
  const [path, lx, ly] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, curvature: 0.35 });
  const e = data!.edge;
  const cls = `flow flow-${e.kind} ${data!.active ? "is-active" : ""} ${data!.dimmed ? "is-dimmed" : ""}`;

  return (
    <>
      <BaseEdge path={path} className={cls} markerEnd={markerEnd} />
      {data!.active &&
        [0, 0.6, 1.2].map((begin) => (
          <circle key={begin} r={3.2} className="particle">
            <animateMotion dur="1.8s" begin={`${begin}s`} repeatCount="indefinite" path={path} />
          </circle>
        ))}
      <EdgeLabelRenderer>
        <div
          className={`edge-label ${data!.active ? "is-active" : ""} ${data!.dimmed ? "is-dimmed" : ""}`}
          style={{ transform: `translate(-50%, -50%) translate(${lx}px, ${ly}px)` }}
          title={e.evidence}
        >
          {e.label}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
