import { Handle, Position, useStore, type Node, type NodeProps } from "@xyflow/react";
import type { Decision } from "../../../src/shared/analysis";
import { outHandle } from "../graph";
import { DECISION_H, DECISION_W, FAR_ZOOM, OUTCOME_SIDES } from "../layout";

export type DecisionNodeData = { decision: Decision; selected: boolean; dimmed: boolean };

const POS = { right: Position.Right, bottom: Position.Bottom, top: Position.Top } as const;
const STATUS_LABEL = { nueva: "condición nueva", cambió: "condición cambiada", igual: "sin cambios" } as const;

export function DecisionNode({ data }: NodeProps<Node<DecisionNodeData>>) {
  const { decision: d, selected, dimmed } = data;
  const far = useStore((s) => s.transform[2] < FAR_ZOOM);
  const w = DECISION_W;
  const h = DECISION_H;

  return (
    <div className={`decision status-${d.status} ${far ? "is-far" : ""} ${selected ? "is-selected" : ""} ${dimmed ? "is-dimmed" : ""}`} style={{ width: w, height: h }}>
      <svg className="decision-shape" width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
        <polygon points={`${w / 2},2 ${w - 2},${h / 2} ${w / 2},${h - 2} 2,${h / 2}`} />
      </svg>
      <div className="decision-text">{far ? "?" : d.condition}</div>
      {!far && d.status !== "igual" && <span className="decision-status">{STATUS_LABEL[d.status]}</span>}
      <Handle type="target" position={Position.Left} id="in" className="h" />
      {d.outcomes.map((o, i) => (
        <Handle key={o.id} type="source" position={POS[OUTCOME_SIDES[i] ?? "right"]} id={outHandle(o)} className="h" />
      ))}
    </div>
  );
}
