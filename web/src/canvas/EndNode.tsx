import { Handle, Position, useStore, type Node, type NodeProps } from "@xyflow/react";
import { END_H, END_W, FAR_ZOOM } from "../layout";

export type EndNodeData = { label: string; tone: "error" | "ok"; dimmed: boolean };

/** Donde una salida termina el flujo, por ejemplo respondiendo un error */
export function EndNode({ data }: NodeProps<Node<EndNodeData>>) {
  const far = useStore((s) => s.transform[2] < FAR_ZOOM);
  return (
    <div className={`end tone-${data.tone} ${far ? "is-far" : ""} ${data.dimmed ? "is-dimmed" : ""}`} style={{ width: END_W, height: END_H }}>
      <Handle type="target" position={Position.Left} id="in" className="h" />
      <span className="end-dot" />
      {data.label}
    </div>
  );
}
