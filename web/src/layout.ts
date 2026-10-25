import ELK, { type ElkNode, type ElkPort } from "elkjs/lib/elk.bundled.js";
import type { Analysis, Block, Edge } from "../../src/shared/analysis";

/** Geometría de la card: tiene que coincidir con el CSS de .block-head y .row */
/** Debajo de este zoom las cards muestran solo el título grande */
export const FAR_ZOOM = 0.55;
export const BLOCK_W = 320;
export const BORDER = 1.5;
export const HEADER_H = 62;
export const ROWS_PAD = 5;
export const ROW_H = 32;
export const CARD_PORT_Y = 24;

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

function ports(b: Block): ElkPort[] {
  const side = (id: string, y: number, out: boolean): ElkPort => ({
    id: portId(b.id, id),
    x: out ? BLOCK_W : 0,
    y,
    width: 0,
    height: 0,
    layoutOptions: { "elk.port.side": out ? "EAST" : "WEST" },
  });
  return [
    side("card:in", CARD_PORT_Y, false),
    side("card:out", CARD_PORT_Y, true),
    ...b.rows.flatMap((r, i) => [side(`${r.id}:in`, rowY(i), false), side(`${r.id}:out`, rowY(i), true)]),
  ];
}

/** ELK no hereda el espaciado de la raíz a los grupos con INCLUDE_CHILDREN: va en cada nivel */
const SPACING = {
  "elk.spacing.nodeNode": "48",
  "elk.spacing.edgeNode": "24",
  "elk.spacing.edgeEdge": "14",
  "elk.layered.spacing.nodeNodeBetweenLayers": "120",
  "elk.layered.spacing.edgeNodeBetweenLayers": "28",
};

export async function layoutAnalysis(a: Analysis): Promise<Layout> {
  const graph: ElkNode = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.hierarchyHandling": "INCLUDE_CHILDREN",
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.json.edgeCoords": "ROOT",
      ...SPACING,
      "elk.spacing.componentComponent": "180",
      "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
    },
    children: a.groups.map((g) => ({
      id: g.id,
      layoutOptions: { ...SPACING, "elk.padding": "[top=100,left=32,bottom=32,right=32]" },
      children: a.blocks
        .filter((b) => b.group === g.id)
        .map((b) => ({ id: b.id, width: BLOCK_W, height: blockHeight(b), ports: ports(b), layoutOptions: { "elk.portConstraints": "FIXED_POS" } })),
    })),
    edges: a.edges.map((e) => {
      const { source, target } = edgeEnds(e);
      return { id: e.id, sources: [source], targets: [target] };
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
