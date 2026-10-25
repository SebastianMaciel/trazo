import ELK from "elkjs/lib/elk.bundled.js";
import type { Analysis, Block } from "../../src/shared/analysis";

export const BLOCK_W = 320;
const HEADER_H = 62;
const ROW_H = 32;

export const blockHeight = (b: Block) => HEADER_H + b.rows.length * ROW_H + 10;

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
}

const elk = new ELK();

export async function layoutAnalysis(a: Analysis): Promise<Layout> {
  const graph = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.hierarchyHandling": "INCLUDE_CHILDREN",
      "elk.spacing.nodeNode": "48",
      "elk.layered.spacing.nodeNodeBetweenLayers": "120",
      "elk.spacing.componentComponent": "180",
      "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
    },
    children: a.groups.map((g) => ({
      id: g.id,
      layoutOptions: { "elk.padding": "[top=100,left=32,bottom=32,right=32]" },
      children: a.blocks.filter((b) => b.group === g.id).map((b) => ({ id: b.id, width: BLOCK_W, height: blockHeight(b) })),
    })),
    edges: a.edges.map((e) => ({ id: e.id, sources: [e.from], targets: [e.to] })),
  };

  const res = await elk.layout(graph);
  const out: Layout = { groups: {}, blocks: {} };
  for (const g of res.children ?? []) {
    out.groups[g.id] = { x: g.x ?? 0, y: g.y ?? 0, w: g.width ?? 0, h: g.height ?? 0 };
    for (const b of g.children ?? []) out.blocks[b.id] = { x: b.x ?? 0, y: b.y ?? 0, w: b.width ?? 0, h: b.height ?? 0 };
  }
  return out;
}
