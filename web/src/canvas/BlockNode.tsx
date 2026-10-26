import { Handle, Position, useStore, type NodeProps, type Node } from "@xyflow/react";
import type { Block, RowChange } from "../../../src/shared/analysis";
import { VERDICT_MARK, type Verdict } from "../store";

import { BLOCK_W, FAR_ZOOM, MIN_TEXT_PX, headerHeight, rowHeight } from "../layout";

export type BlockNodeData = {
  block: Block;
  /** Número según el flujo (5a, 5b si van en paralelo) */
  step: string | null;
  /** Primer paso del recorrido, cuando no hay nada seleccionado */
  start: string | null;
  selected: boolean;
  dimmed: boolean;
  verdict?: Verdict;
};

const KIND_LABEL: Record<Block["kind"], string> = {
  endpoint: "endpoint",
  función: "función",
  componente: "componente",
  tipo: "tipo",
  config: "config",
  test: "test",
  copy: "texto",
};

const CHANGE_MARK: Record<RowChange, string> = { added: "+", modified: "~", deleted: "−", affected: "·" };

export function BlockNode({ data }: NodeProps<Node<BlockNodeData>>) {
  const { block, step, start, selected, dimmed, verdict } = data;
  // Redondeado para no redibujar todas las cards en cada paso del pellizco
  const zoom = useStore((s) => Math.round(s.transform[2] * 40) / 40);
  const far = zoom < FAR_ZOOM;
  // De lejos el título apunta a 14px en pantalla, achicado para entrar en un renglón (la mono ocupa ~0.62em por letra)
  // pero nunca debajo del mínimo legible: si ni así entra, se parte
  const z = Math.max(zoom, 0.05);
  const fit = (BLOCK_W - 60 - (verdict ? 56 : 0)) / (block.title.length * 0.62);
  const farSize = Math.min(56, Math.max(MIN_TEXT_PX / z, Math.min(14 / z, fit)));

  const cls = ["block", far && "is-far", start && "is-start", selected && "is-selected", dimmed && "is-dimmed", verdict && `is-${verdict}`, block.affected && "is-affected"]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={cls}>
      {start && <span className="start-tag">{start}</span>}
      {step && <span className="step">{step}</span>}
      <Handle type="target" position={Position.Left} id="card:in" className="h h-card" />
      <Handle type="source" position={Position.Right} id="card:out" className="h h-card" />

      <header className="block-head" style={{ height: headerHeight(block) }}>
        <div className="block-title-row">
          <span className="block-title">{block.title}</span>
          <VerdictBadge verdict={verdict} />
          <span className={`chip chip-${block.kind}`}>{KIND_LABEL[block.kind]}</span>
        </div>
        <div className="block-file">
          {block.affected ? "sin cambios · lo afecta otro cambio" : block.file}
          {block.warnings?.length ? <span className="warn-dot" title="Tiene advertencias">!</span> : null}
        </div>
      </header>
      {/* Las filas se renderizan siempre: de sus handles salen las flechas */}
      <ul className="rows">
        {block.rows.map((r) => (
          <li key={r.id} className={`row row-${r.change}`} style={{ height: rowHeight(r) }}>
            <Handle type="target" position={Position.Left} id={`${r.id}:in`} className="h" />
            <span className="row-mark">{CHANGE_MARK[r.change]}</span>
            <span className="row-text">
              {r.before && <s className="row-before">{r.before}</s>}
              <span className="row-label">{r.label}</span>
            </span>
            <Handle type="source" position={Position.Right} id={`${r.id}:out`} className="h" />
          </li>
        ))}
      </ul>

      {/* Siempre está, así el paso de cerca a lejos es un fundido y no un salto */}
      <div className="block-far" aria-hidden={!far}>
        <div className="block-far-head" style={{ minHeight: headerHeight(block) }}>
          <span className="block-far-title" style={{ fontSize: farSize }}>
            {block.title}
          </span>
          <VerdictBadge verdict={verdict} />
        </div>
        {/* Cada fila como una línea que no se lee: avisa que acercándote hay más */}
        <div className="block-far-rows">
          {block.rows.map((r) => (
            <span key={r.id} className={`ghost ghost-${r.change}`} style={{ flexGrow: rowHeight(r) }}>
              <i style={{ width: `${Math.min(100, Math.max(30, (r.label.length / 36) * 100))}%` }} />
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function VerdictBadge({ verdict }: { verdict?: Verdict }) {
  if (!verdict) return null;
  const title = { ok: "Está bien", change: "Pedís un cambio", doubt: "Tenés dudas" }[verdict];
  return (
    <span className={`badge badge-${verdict}`} title={title}>
      {VERDICT_MARK[verdict]}
    </span>
  );
}
