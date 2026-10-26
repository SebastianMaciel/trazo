import { useStore, type Node, type NodeProps } from "@xyflow/react";
import type { Group } from "../../../src/shared/analysis";

import { FAR_ZOOM, MIN_TEXT_PX } from "../layout";

export type GroupNodeData = { group: Group; n: number; done: number; total: number; dimmed: boolean };

export function GroupNode({ data, width = 0 }: NodeProps<Node<GroupNodeData>>) {
  const { group, n, done, total, dimmed } = data;
  const zoom = useStore((s) => s.transform[2]);
  const far = zoom < FAR_ZOOM;
  // El título apunta a 18px en pantalla y nunca más ancho que el grupo: número, título y progreso entran en su caja
  const want = 18 / Math.max(zoom, 0.05);
  const fit = (width - 68) / (group.title.length * 0.56 + 5);
  // Adentro del grupo hay lugar para un título de hasta ~58px del canvas; más lejos el título sale arriba de la caja
  const above = want > 58;
  const size = above ? Math.min(want, fit) : Math.min(58, Math.max(20, want), fit);
  // Si ni así se lee, queda el número grande: el mismo de las cards y del índice
  const onlyNumber = size * zoom < MIN_TEXT_PX;

  return (
    <div className={`group ${group.minor ? "is-minor" : ""} ${dimmed ? "is-dimmed" : ""} ${far ? "is-far" : ""}`}>
      <div className={`group-head ${above ? "is-above" : ""}`} style={{ fontSize: onlyNumber ? Math.min(want, width / 1.6) : size }}>
        <span className="group-n">{n}</span>
        {!onlyNumber && <span className="group-title">{group.title}</span>}
        {!onlyNumber && (
          <span className="group-progress" style={{ fontSize: Math.max(13, size * 0.55) }}>
            {done}/{total}
          </span>
        )}
      </div>
    </div>
  );
}
