import { useStore, type Node, type NodeProps } from "@xyflow/react";
import type { Group } from "../../../src/shared/analysis";

import { FAR_ZOOM, INTENT_ZOOM } from "../layout";

export type GroupNodeData = { group: Group; n: number; done: number; total: number; warns: number; dimmed: boolean };

export function GroupNode({ data, width = 0 }: NodeProps<Node<GroupNodeData>>) {
  const { group, n, done, total, warns, dimmed } = data;
  const zoom = useStore((s) => s.transform[2]);
  const far = zoom < FAR_ZOOM;
  const intent = zoom < INTENT_ZOOM;
  // El título mantiene un tamaño legible en pantalla aunque te alejes
  // y nunca más ancho que el grupo: número, título y progreso tienen que entrar en su caja
  const fit = (width - 68) / (group.title.length * 0.56 + 5);
  const size = Math.min(64, Math.max(20, 20 / zoom), fit);

  return (
    <div className={`group ${group.minor ? "is-minor" : ""} ${dimmed ? "is-dimmed" : ""} ${far ? "is-far" : ""} ${intent ? "is-intent" : ""}`}>
      {intent ? (
        // Vista de intención: el grupo tapa sus bloques y dice qué cambia, en letra de tamaño fijo en pantalla.
        // Si no entra, queda su número, el mismo de la lista del panel
        <div className="group-intent" style={{ fontSize: 14 / zoom }} title={group.title}>
          {width * zoom >= 150 ? (
            <>
              <span className="group-n">{n}</span>
              <span className="group-title">{group.title}</span>
              <span className="group-meta">
                {done} de {total}
                {warns > 0 && <span className="group-warns"> · {warns} !</span>}
              </span>
            </>
          ) : (
            <span className="group-n is-alone">{n}</span>
          )}
        </div>
      ) : (
        <div className="group-head" style={{ fontSize: size }}>
          <span className="group-n">{n}</span>
          <span className="group-title">{group.title}</span>
          <span className="group-progress" style={{ fontSize: Math.max(13, size * 0.55) }}>
            {done}/{total}
          </span>
        </div>
      )}
    </div>
  );
}
