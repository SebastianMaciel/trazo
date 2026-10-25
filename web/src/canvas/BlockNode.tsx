import { Handle, Position, useStore, type NodeProps, type Node } from "@xyflow/react";
import type { Block, RowChange } from "../../../src/shared/analysis";

export type BlockNodeData = {
  block: Block;
  /** Posición en el recorrido, 0 si no está */
  step: number;
  selected: boolean;
  dimmed: boolean;
  checked: boolean;
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
  const { block, step, selected, dimmed, checked } = data;
  const far = useStore((s) => s.transform[2] < 0.45);

  const cls = ["block", far && "is-far", `risk-${block.risk}`, selected && "is-selected", dimmed && "is-dimmed", checked && "is-checked", block.affected && "is-affected"]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={cls}>
      {step > 0 && <span className="step">{step}</span>}
      <Handle type="target" position={Position.Left} id="card:in" className="h h-card" />
      <Handle type="source" position={Position.Right} id="card:out" className="h h-card" />

      <header className="block-head">
        <div className="block-title-row">
          <span className="block-title">{block.title}</span>
          {checked && <span className="check-badge" title="Entendido">✓</span>}
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
          <li key={r.id} className={`row row-${r.change}`}>
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

      {far && (
        <div className="block-far">
          <span className="block-far-title" style={{ fontSize: Math.min(40, 520 / block.title.length) }}>
            {block.title}
          </span>
          {checked && <span className="check-badge">✓</span>}
        </div>
      )}
    </div>
  );
}
