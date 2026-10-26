import ELK, { type ElkNode, type ElkPort } from "elkjs/lib/elk.bundled.js";
import type { Analysis, Block, Row } from "../../src/shared/analysis";
import { buildGraph, outHandle, type Graph } from "./graph";

/** Texto más chico que esto en pantalla no se lee */
export const MIN_TEXT_PX = 11;
/** Las filas miden 12.5px: debajo de este zoom quedarían ilegibles y la card muestra solo su título */
export const FAR_ZOOM = MIN_TEXT_PX / 12.5;

/** Geometría de la card: tiene que coincidir con el CSS de .block-head y .row */
export const BLOCK_W = 340;
export const BORDER = 1.5;
export const HEADER_H = 70;
export const ROWS_PAD = 8;
export const ROW_LINE_H = 18;
export const ROW_PAD_Y = 9;
export const CARD_PORT_Y = 28;
/**
 * Cuántas letras entran por renglón en una fila. Es una estimación a la baja para la mono más ancha de los temas:
 * si el texto real ocupa menos, sobra un poco de aire; nunca se corta
 */
const ROW_COLS = 36;

/** Rombo y final: tienen que coincidir con DecisionNode y EndNode */
export const DECISION_W = 210;
export const DECISION_H = 120;
export const END_W = 170;
export const END_H = 48;

/** Renglones que ocupa un texto partido por palabras, cortando las palabras que no entran solas */
export function wrapLines(text: string, cols = ROW_COLS) {
  let lines = 1;
  let used = 0;
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const len = word.length;
    if (used === 0) {
      lines += Math.ceil(len / cols) - 1;
      used = len % cols || cols;
    } else if (used + 1 + len <= cols) used += 1 + len;
    else {
      lines += Math.ceil(len / cols);
      used = len % cols || cols;
    }
  }
  return lines;
}

/** El alto de una fila: lo de antes va tachado en su propio renglón, arriba de lo nuevo */
export const rowHeight = (r: Row) => ROW_PAD_Y * 2 + ROW_LINE_H * ((r.before ? wrapLines(r.before) : 0) + wrapLines(r.label));

/** El header crece si el título no entra en un renglón al lado del chip */
const TITLE_COLS = 22;
const TITLE_LINE_H = 20;
export const headerHeight = (b: Block) => HEADER_H + (wrapLines(b.title, TITLE_COLS) - 1) * TITLE_LINE_H;

export const blockHeight = (b: Block) => BORDER * 2 + headerHeight(b) + ROWS_PAD * 2 + b.rows.reduce((h, r) => h + rowHeight(r), 0);
const rowY = (b: Block, i: number) => BORDER + headerHeight(b) + ROWS_PAD + b.rows.slice(0, i).reduce((h, r) => h + rowHeight(r), 0) + rowHeight(b.rows[i]) / 2;

/** Dónde sale cada salida del rombo: la primera por la derecha, la segunda por abajo, la tercera por arriba */
export const OUTCOME_SIDES = ["right", "bottom", "top"] as const;

export interface Point {
  x: number;
  y: number;
}

export interface Placed {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Layout {
  graph: Graph;
  groups: Record<string, Placed>;
  /** Bloques, rombos y finales. Posición relativa al grupo */
  nodes: Record<string, Placed>;
  /** Recorrido de cada cable en coordenadas absolutas, ya esquivando los nodos */
  wires: Record<string, Point[]>;
}

const elk = new ELK();
const portKey = (node: string, handle: string) => `${node}|${handle}`;

/** Separación entre cables que salen o entran por el mismo punto */
const CABLE_GAP = 8;

/** ELK no hereda el espaciado de la raíz a los grupos con INCLUDE_CHILDREN: va en cada nivel */
const SPACING = {
  "elk.spacing.nodeNode": "72",
  "elk.spacing.edgeNode": "36",
  "elk.spacing.edgeEdge": "20",
  "elk.layered.spacing.nodeNodeBetweenLayers": "200",
  "elk.layered.spacing.edgeNodeBetweenLayers": "48",
};

type Side = "WEST" | "EAST" | "NORTH" | "SOUTH";

/**
 * Un puerto por cada cable que usa un punto. Si dos cables salen de la misma fila,
 * cada uno tiene su puerto (separados CABLE_GAP): son dos cables y no un tronco que
 * se abre, que se leería como un if. Los ifs de verdad son los rombos.
 */
function portsAt(node: string, handle: string, x: number, y: number, side: Side, uses: Map<string, string[]>): ElkPort[] {
  const key = portKey(node, handle);
  const wires = uses.get(key) ?? [];
  const n = Math.max(1, wires.length);
  const vertical = side === "WEST" || side === "EAST";
  return Array.from({ length: n }, (_, i) => {
    const off = (i - (n - 1) / 2) * CABLE_GAP;
    return {
      id: wires[i] ? `${key}#${wires[i]}` : key,
      x: vertical ? x : x + off,
      y: vertical ? y + off : y,
      width: 0,
      height: 0,
      layoutOptions: { "elk.port.side": side },
    };
  });
}

function nodeFor(a: Analysis, g: Graph, id: string, uses: Map<string, string[]>): ElkNode {
  const kind = g.nodes.find((n) => n.id === id)!.kind;
  const fixed = { "elk.portConstraints": "FIXED_POS" };

  if (kind === "block") {
    const b = a.blocks.find((x) => x.id === id)!;
    const ports = [
      ...portsAt(id, "card:in", 0, CARD_PORT_Y, "WEST", uses),
      ...portsAt(id, "card:out", BLOCK_W, CARD_PORT_Y, "EAST", uses),
      ...b.rows.flatMap((r, i) => [
        ...portsAt(id, `${r.id}:in`, 0, rowY(b, i), "WEST", uses),
        ...portsAt(id, `${r.id}:out`, BLOCK_W, rowY(b, i), "EAST", uses),
      ]),
    ];
    return { id, width: BLOCK_W, height: blockHeight(b), ports, layoutOptions: fixed };
  }

  if (kind === "decision") {
    const d = a.decisions.find((x) => x.id === id)!;
    const at = { right: [DECISION_W, DECISION_H / 2, "EAST"], bottom: [DECISION_W / 2, DECISION_H, "SOUTH"], top: [DECISION_W / 2, 0, "NORTH"] } as const;
    const ports = [
      ...portsAt(id, "in", 0, DECISION_H / 2, "WEST", uses),
      ...d.outcomes.flatMap((o, i) => {
        const [x, y, side] = at[OUTCOME_SIDES[i] ?? "right"];
        return portsAt(id, outHandle(o), x, y, side, uses);
      }),
    ];
    return { id, width: DECISION_W, height: DECISION_H, ports, layoutOptions: fixed };
  }

  return { id, width: END_W, height: END_H, ports: portsAt(id, "in", 0, END_H / 2, "WEST", uses), layoutOptions: fixed };
}

export async function layoutAnalysis(a: Analysis): Promise<Layout> {
  const g = buildGraph(a);

  // Qué cables usa cada punto, para darle un puerto propio a cada uno
  const uses = new Map<string, string[]>();
  for (const w of g.wires) {
    for (const k of [portKey(w.source, w.sourceHandle), portKey(w.target, w.targetHandle)]) uses.set(k, [...(uses.get(k) ?? []), w.id]);
  }

  // Los hijos van en el orden del recorrido; rombos y finales justo después del bloque del que salen
  const order = (id: string) => {
    const d = a.decisions.find((x) => x.id === id || id.startsWith(`end:${x.id}:`));
    const base = d ? d.from : id;
    const i = a.tour.indexOf(base);
    return (i === -1 ? 1e6 : i) + (d ? 0.5 : 0);
  };

  const graph: ElkNode = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.hierarchyHandling": "INCLUDE_CHILDREN",
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.json.edgeCoords": "ROOT",
      ...SPACING,
      "elk.spacing.componentComponent": "240",
      "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
      // Los grupos van de izquierda a derecha en su orden, aunque una flecha vuelva de uno posterior
      "elk.partitioning.activate": "true",
    },
    children: a.groups.map((grp, gi) => ({
      id: grp.id,
      layoutOptions: { ...SPACING, "elk.padding": "[top=120,left=56,bottom=56,right=56]", "elk.partitioning.partition": String(gi) },
      children: g.nodes
        .filter((n) => n.group === grp.id)
        .sort((x, y) => order(x.id) - order(y.id))
        .map((n) => nodeFor(a, g, n.id, uses)),
    })),
    edges: g.wires.map((w) => ({
      id: w.id,
      sources: [`${portKey(w.source, w.sourceHandle)}#${w.id}`],
      targets: [`${portKey(w.target, w.targetHandle)}#${w.id}`],
    })),
  };

  const res = await elk.layout(graph);
  const out: Layout = { graph: g, groups: {}, nodes: {}, wires: {} };
  const collect = (n: ElkNode) => {
    for (const e of n.edges ?? []) {
      const s = e.sections?.[0];
      if (s) out.wires[e.id] = [s.startPoint, ...(s.bendPoints ?? []), s.endPoint];
    }
    for (const c of n.children ?? []) collect(c);
  };
  collect(res);
  for (const grp of res.children ?? []) {
    out.groups[grp.id] = { x: grp.x ?? 0, y: grp.y ?? 0, w: grp.width ?? 0, h: grp.height ?? 0 };
    for (const n of grp.children ?? []) out.nodes[n.id] = { x: n.x ?? 0, y: n.y ?? 0, w: n.width ?? 0, h: n.height ?? 0 };
  }
  return out;
}
