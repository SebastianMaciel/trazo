import { BaseEdge, EdgeLabelRenderer, getBezierPath, useStore, type Edge, type EdgeProps } from "@xyflow/react";
import type { Edge as AEdge } from "../../../src/shared/analysis";
import type { Point } from "../layout";

import { FAR_ZOOM } from "../layout";

export type FlowEdgeData = { edge: AEdge; active: boolean; dimmed: boolean; points?: Point[] };

/** Polilínea ortogonal con esquinas redondeadas */
function roundedPath(pts: Point[], radius = 14): string {
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [a, p, b] = [pts[i - 1], pts[i], pts[i + 1]];
    const lin = Math.hypot(p.x - a.x, p.y - a.y);
    const lout = Math.hypot(b.x - p.x, b.y - p.y);
    const r = Math.min(radius, lin / 2, lout / 2);
    const inX = p.x - ((p.x - a.x) / lin) * r;
    const inY = p.y - ((p.y - a.y) / lin) * r;
    const outX = p.x + ((b.x - p.x) / lout) * r;
    const outY = p.y + ((b.y - p.y) / lout) * r;
    d += ` L ${inX} ${inY} Q ${p.x} ${p.y} ${outX} ${outY}`;
  }
  const last = pts[pts.length - 1];
  return d + ` L ${last.x} ${last.y}`;
}

/**
 * La etiqueta va en el medio del tramo horizontal más largo: los verticales suelen correr
 * pegados a una card y la etiqueta la taparía. Si no hay horizontales, el más largo.
 */
function labelPoint(pts: Point[]): Point {
  const segs = pts.slice(1).map((b, i) => {
    const a = pts[i];
    return { len: Math.hypot(b.x - a.x, b.y - a.y), horizontal: Math.abs(b.y - a.y) < 1, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
  });
  const pool = segs.some((s) => s.horizontal && s.len > 60) ? segs.filter((s) => s.horizontal) : segs;
  return pool.reduce((best, s) => (s.len > best.len ? s : best)).mid;
}

export function FlowEdge(props: EdgeProps<Edge<FlowEdgeData>>) {
  const { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, markerEnd, markerStart } = props;
  const e = data!.edge;
  const far = useStore((s) => s.transform[2] < FAR_ZOOM);

  let path: string;
  let lx: number;
  let ly: number;
  if (data!.points && data!.points.length >= 2) {
    path = roundedPath(data!.points);
    ({ x: lx, y: ly } = labelPoint(data!.points));
  } else {
    [path, lx, ly] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, curvature: 0.35 });
  }
  const cls = `flow flow-${e.kind} ${data!.active ? "is-active" : ""} ${data!.dimmed ? "is-dimmed" : ""}`;
  // En las de test el layout va código → test, así que las partículas corren al revés
  const reverse = e.kind === "testea";

  return (
    <>
      <BaseEdge path={path} className={cls} markerEnd={markerEnd} markerStart={markerStart} />
      {data!.active &&
        [0, 0.6, 1.2].map((begin) => (
          // Escondida hasta que arranca: si no, espera parada en el origen del mapa
          <circle key={begin} r={3.2} className="particle" visibility="hidden">
            <set attributeName="visibility" to="visible" begin={`${begin}s`} />
            <animateMotion
              dur="1.8s"
              begin={`${begin}s`}
              repeatCount="indefinite"
              path={path}
              {...(reverse ? { keyPoints: "1;0", keyTimes: "0;1", calcMode: "linear" } : {})}
            />
          </circle>
        ))}
      {!far && data!.active && (
        <EdgeLabelRenderer>
          <div className="edge-label is-active" // Arriba de la línea, no encima: así no tapa el trazo
            style={{ transform: `translate(-50%, calc(-100% - 8px)) translate(${lx}px, ${ly}px)` }}>
            <span className="edge-label-data">{e.label}</span>
            {/* La evidencia: dónde se ve en el código que esta flecha es real */}
            <span className="edge-label-ev">{e.evidence.split("/").pop()}</span>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
