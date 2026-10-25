import { useStore, type Node, type NodeProps } from "@xyflow/react";
import type { Group } from "../../../src/shared/analysis";

export type GroupNodeData = { group: Group; done: number; total: number; dimmed: boolean };

export function GroupNode({ data }: NodeProps<Node<GroupNodeData>>) {
  const { group, done, total, dimmed } = data;
  const zoom = useStore((s) => s.transform[2]);
  // El título mantiene un tamaño legible en pantalla aunque te alejes: es la vista de "intención"
  const size = Math.min(64, Math.max(20, 20 / zoom));
  const far = zoom < 0.45;

  return (
    <div className={`group risk-${group.risk} ${group.minor ? "is-minor" : ""} ${dimmed ? "is-dimmed" : ""} ${far ? "is-far" : ""}`}>
      <div className="group-head" style={{ fontSize: size }}>
        <span className="group-title">{group.title}</span>
        <span className="group-progress" style={{ fontSize: Math.max(13, size * 0.55) }}>
          {done}/{total}
        </span>
      </div>
      {!far && <p className="group-summary">{group.summary}</p>}
    </div>
  );
}
