import ELK, { type ElkNode, type ElkPort } from "elkjs/lib/elk.bundled.js";
import type { Analysis, Block, Edge } from "../../src/shared/analysis";

/** Geometría de la card: tiene que coincidir con el CSS de .block-head y .row */
/** Debajo de este zoom las cards muestran solo el título grande */
export const FAR_ZOOM = 0.55;
export const BLOCK_W = 340;
export const BORDER = 1.5;
export const HEADER_H = 70;
export const ROWS_PAD = 8;
export const ROW_H = 36;
export const CARD_PORT_Y = 28;

export const blockHeight = (b: Block) => BORDER * 2 + HEADER_H + ROWS_PAD * 2 + b.rows.length * ROW_H;
const rowY = (i: number) => BORDER + HEADER_H + ROWS_PAD + i * ROW_H + ROW_H / 2;

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
  groups: Record<string, Placed>;
  /** Posición relativa al grupo */
  blocks: Record<string, Placed>;
  /** Recorrido de cada flecha en coordenadas absolutas, ya esquivando los bloques */
  edges: Record<string, Point[]>;
}

const elk = new ELK();
const portId = (block: string, handle: string) => `${block}|${handle}`;

/** Separación entre cables que salen o entran por la misma fila */
const CABLE_GAP = 8;

/**
 * Puertos de cada lado de la flecha. Las de test se invierten para el layout
 * (código → test) así los tests quedan después del código que prueban; la punta se dibuja al revés.
 */
export function edgeEnds(e: Edge) {
  if (e.kind === "testea") {
    return { source: portId(e.to, e.toRow ? `${e.toRow}:out` : "card:out"), target: portId(e.from, e.fromRow ? `${e.fromRow}:in` : "card:in") };
  }
  return { source: portId(e.from, e.fromRow ? `${e.fromRow}:out` : "card:out"), target: portId(e.to, e.toRow ? `${e.toRow}:in` : "card:in") };
}

/**
 * Un puerto por cada flecha que usa un punto de la card. Si dos flechas salen de la
 * misma fila, cada una tiene su puerto (separados CABLE_GAP): son dos cables y no un
 * tronco que se abre, que se leería como un if.
 */
function ports(b: Block, uses: Map<string, string[]>): ElkPort[] {
  const out: ElkPort[] = [];
  const add = (handle: string, y: number, isOut: boolean) => {
    const key = portId(b.id, handle);
    const edges = uses.get(key) ?? [];
    const n = Math.max(1, edges.length);
    for (let i = 0; i < n; i++) {
      out.push({
        id: edges[i] ? `${key}#${edges[i]}` : key,
        x: isOut ? BLOCK_W : 0,
        y: y + (i - (n - 1) / 2) * CABLE_GAP,
        width: 0,
        height: 0,
        layoutOptions: { "elk.port.side": isOut ? "EAST" : "WEST" },
      });
    }
  };
  add("card:in", CARD_PORT_Y, false);
  add("card:out", CARD_PORT_Y, true);
  b.rows.forEach((r, i) => {
    add(`${r.id}:in`, rowY(i), false);
    add(`${r.id}:out`, rowY(i), true);
  });
  return out;
}

/** ELK no hereda el espaciado de la raíz a los grupos con INCLUDE_CHILDREN: va en cada nivel */
const SPACING = {
  "elk.spacing.nodeNode": "72",
  "elk.spacing.edgeNode": "36",
  "elk.spacing.edgeEdge": "20",
  "elk.layered.spacing.nodeNodeBetweenLayers": "220",
  "elk.layered.spacing.edgeNodeBetweenLayers": "48",
};

export async function layoutAnalysis(a: Analysis): Promise<Layout> {
  // Qué flechas usa cada punto de cada card, para darle un puerto propio a cada una
  const uses = new Map<string, string[]>();
  for (const e of a.edges) {
    const { source, target } = edgeEnds(e);
    uses.set(source, [...(uses.get(source) ?? []), e.id]);
    uses.set(target, [...(uses.get(target) ?? []), e.id]);
  }
  // Los hijos van en el orden del recorrido y ELK lo respeta: las ramas paralelas se leen de arriba hacia abajo
  const order = (id: string) => (a.tour.includes(id) ? a.tour.indexOf(id) : Infinity);
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
    },
    children: a.groups.map((g) => ({
      id: g.id,
      layoutOptions: { ...SPACING, "elk.padding": "[top=120,left=56,bottom=56,right=56]" },
      children: a.blocks
        .filter((b) => b.group === g.id)
        .sort((x, y) => order(x.id) - order(y.id))
        .map((b) => ({ id: b.id, width: BLOCK_W, height: blockHeight(b), ports: ports(b, uses), layoutOptions: { "elk.portConstraints": "FIXED_POS" } })),
    })),
    edges: a.edges.map((e) => {
      const { source, target } = edgeEnds(e);
      return { id: e.id, sources: [`${source}#${e.id}`], targets: [`${target}#${e.id}`] };
    }),
  };

  const res = await elk.layout(graph);
  const out: Layout = { groups: {}, blocks: {}, edges: {} };
  const collectEdges = (n: ElkNode) => {
    for (const e of n.edges ?? []) {
      const s = e.sections?.[0];
      if (s) out.edges[e.id] = [s.startPoint, ...(s.bendPoints ?? []), s.endPoint];
    }
    for (const c of n.children ?? []) collectEdges(c);
  };
  collectEdges(res);
  for (const g of res.children ?? []) {
    out.groups[g.id] = { x: g.x ?? 0, y: g.y ?? 0, w: g.width ?? 0, h: g.height ?? 0 };
    for (const b of g.children ?? []) out.blocks[b.id] = { x: b.x ?? 0, y: b.y ?? 0, w: b.width ?? 0, h: b.height ?? 0 };
  }
  return out;
}
