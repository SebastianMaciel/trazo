import type { Analysis, Decision, Edge, EdgeKind, Outcome } from "../../src/shared/analysis";

/**
 * El análisis convertido en algo que se puede dibujar: bloques, decisiones (rombos),
 * finales (donde una salida corta el flujo) y cables entre ellos.
 */
export type GNodeKind = "block" | "decision" | "end";

export interface GNode {
  id: string;
  kind: GNodeKind;
  group: string;
}

export interface Wire {
  id: string;
  source: string;
  sourceHandle: string;
  target: string;
  targetHandle: string;
  kind: EdgeKind | "salida";
  label: string;
  evidence: string;
  /** Las de test se rutean al revés (código → test) para que los tests queden al final */
  reversed?: boolean;
  /** Para los cables que salen de un rombo */
  outcome?: Outcome;
  edge?: Edge;
}

export interface Graph {
  nodes: GNode[];
  wires: Wire[];
}

export const endId = (d: Decision, o: Outcome) => `end:${d.id}:${o.id}`;
export const outHandle = (o: Outcome) => `out:${o.id}`;

export function buildGraph(a: Analysis): Graph {
  const groupOf = new Map(a.blocks.map((b) => [b.id, b.group]));
  const nodes: GNode[] = a.blocks.map((b) => ({ id: b.id, kind: "block", group: b.group }));
  const wires: Wire[] = a.edges.map((e) => {
    const from = { node: e.from, handle: e.fromRow ? `${e.fromRow}:out` : "card:out" };
    const to = { node: e.to, handle: e.toRow ? `${e.toRow}:in` : "card:in" };
    if (e.kind === "testea") {
      // código → test: sale por la derecha del código y entra por la izquierda del test
      return {
        id: e.id,
        source: e.to,
        sourceHandle: e.toRow ? `${e.toRow}:out` : "card:out",
        target: e.from,
        targetHandle: e.fromRow ? `${e.fromRow}:in` : "card:in",
        kind: e.kind,
        label: e.label,
        evidence: e.evidence,
        reversed: true,
        edge: e,
      };
    }
    return { id: e.id, source: from.node, sourceHandle: from.handle, target: to.node, targetHandle: to.handle, kind: e.kind, label: e.label, evidence: e.evidence, edge: e };
  });

  for (const d of a.decisions) {
    const group = groupOf.get(d.from);
    if (!group) continue;
    nodes.push({ id: d.id, kind: "decision", group });
    wires.push({
      id: `${d.id}:in`,
      source: d.from,
      sourceHandle: d.fromRow ? `${d.fromRow}:out` : "card:out",
      target: d.id,
      targetHandle: "in",
      kind: "datos",
      label: "",
      evidence: d.evidence,
    });
    for (const o of d.outcomes) {
      const base = { id: `${d.id}:${o.id}`, source: d.id, sourceHandle: outHandle(o), kind: "salida" as const, label: o.label, evidence: d.evidence, outcome: o };
      if (o.to && groupOf.has(o.to)) {
        wires.push({ ...base, target: o.to, targetHandle: o.toRow ? `${o.toRow}:in` : "card:in" });
      } else if (o.end) {
        nodes.push({ id: endId(d, o), kind: "end", group });
        wires.push({ ...base, target: endId(d, o), targetHandle: "in" });
      }
    }
  }
  return { nodes, wires };
}

/**
 * Lo que se enciende al seleccionar algo: sus vecinos directos y, si un vecino es un
 * rombo, todo lo que sale de él (para ver la decisión completa, no media).
 */
export function neighborsIn(g: Graph, id: string | null): Set<string> {
  const out = new Set<string>();
  if (!id) return out;
  const kind = new Map(g.nodes.map((n) => [n.id, n.kind]));
  const direct = (x: string) => g.wires.flatMap((w) => (w.source === x ? [w.target] : w.target === x ? [w.source] : []));
  out.add(id);
  for (const n of direct(id)) {
    out.add(n);
    if (kind.get(n) === "decision") for (const m of direct(n)) out.add(m);
  }
  if (kind.get(id) === "decision") for (const n of direct(id)) out.add(n);
  return out;
}

/** Un cable está encendido si toca lo seleccionado o es parte de una decisión encendida */
export function wireActive(g: Graph, w: Wire, selected: string | null, focus: Set<string>): boolean {
  if (!selected) return false;
  if (w.source === selected || w.target === selected) return true;
  const isDecision = (id: string) => g.nodes.some((n) => n.id === id && n.kind === "decision");
  return (isDecision(w.source) || isDecision(w.target)) && focus.has(w.source) && focus.has(w.target);
}
