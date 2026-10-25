import { describe, expect, it } from "vitest";
import type { Analysis, Block, Edge } from "../../src/shared/analysis";
import type { Layout } from "./layout";
import { computeSteps } from "./steps";

const block = (id: string): Block => ({ id, group: "g", title: id, file: "", kind: "función", risk: "bajo", summary: "", rows: [], hunks: [] });
const edge = (from: string, to: string, kind: Edge["kind"] = "datos"): Edge => ({ id: `${from}-${to}`, from, to, kind, label: "", evidence: "" });

function setup(ys: Record<string, number>, edges: Edge[], tour: string[]) {
  const analysis: Analysis = {
    title: "",
    base: "",
    head: "",
    repo: "",
    groups: [{ id: "g", title: "", summary: "", risk: "bajo" }],
    blocks: tour.map(block),
    edges,
    tour,
  };
  const layout: Layout = {
    groups: { g: { x: 0, y: 0, w: 0, h: 0 } },
    blocks: Object.fromEntries(tour.map((id) => [id, { x: 0, y: ys[id] ?? 0, w: 0, h: 0 }])),
    edges: {},
  };
  return computeSteps(analysis, layout);
}

describe("computeSteps", () => {
  it("numera por nivel de flujo y le pone letra a las ramas en paralelo, de arriba hacia abajo", () => {
    // cents → cart → {inst, invoice}; cents → invoice también. invoice está dibujado arriba
    const s = setup(
      { inst: 200, invoice: 0 },
      [edge("cents", "cart"), edge("cart", "inst"), edge("cart", "invoice"), edge("cents", "invoice")],
      ["cents", "cart", "inst", "invoice"],
    );
    expect(s.labels).toEqual({ cents: "1", cart: "2", invoice: "3a", inst: "3b" });
    expect(s.order).toEqual(["cents", "cart", "invoice", "inst"]);
  });

  it("deja los bloques sin flujo (tests, textos) al final y no usa las flechas de test para el nivel", () => {
    const s = setup({}, [edge("a", "b"), edge("test", "a", "testea")], ["a", "b", "test", "copy"]);
    expect(s.labels).toEqual({ a: "1", b: "2", test: "3", copy: "4" });
    expect(s.order).toEqual(["a", "b", "test", "copy"]);
  });

  it("no se cuelga con ciclos", () => {
    const s = setup({}, [edge("a", "b"), edge("b", "a")], ["a", "b"]);
    expect(Object.keys(s.labels).sort()).toEqual(["a", "b"]);
  });
});
