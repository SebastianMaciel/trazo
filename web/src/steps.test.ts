import { describe, expect, it } from "vitest";
import type { Analysis, Block, Edge } from "../../src/shared/analysis";
import { computeSteps } from "./steps";

const block = (id: string): Block => ({ id, group: "g", title: id, file: "", kind: "función", risk: "bajo", summary: "", rows: [], hunks: [] });
const edge = (from: string, to: string, kind: Edge["kind"] = "datos"): Edge => ({ id: `${from}-${to}`, from, to, kind, label: "", evidence: "" });

function setup(edges: Edge[], tour: string[]) {
  const analysis: Analysis = {
    title: "",
    base: "",
    head: "",
    repo: "",
    groups: [{ id: "g", title: "", summary: "", risk: "bajo" }],
    blocks: tour.map(block),
    edges,
    decisions: [],
    tour,
  };
  return computeSteps(analysis);
}

describe("computeSteps", () => {
  it("numera por nivel de flujo y entre ramas paralelas respeta el orden de la AI", () => {
    // cents → cart → {inst, invoice}; cents → invoice también. La AI pide ver inst antes
    const flow = [edge("cents", "cart"), edge("cart", "inst"), edge("cart", "invoice"), edge("cents", "invoice")];
    const s = setup(flow, ["cents", "cart", "inst", "invoice"]);
    expect(s.labels).toEqual({ cents: "1", cart: "2", inst: "3a", invoice: "3b" });
    expect(setup(flow, ["cents", "cart", "invoice", "inst"]).order).toEqual(["cents", "cart", "invoice", "inst"]);
  });

  it("nunca pone algo antes de lo que le pasa datos, aunque la AI lo liste primero", () => {
    const s = setup([edge("a", "b")], ["b", "a"]);
    expect(s.order).toEqual(["a", "b"]);
  });

  it("deja los bloques sin flujo (tests, textos) al final y no usa las flechas de test para el nivel", () => {
    const s = setup([edge("a", "b"), edge("test", "a", "testea")], ["a", "b", "test", "copy"]);
    expect(s.labels).toEqual({ a: "1", b: "2", test: "3", copy: "4" });
    expect(s.order).toEqual(["a", "b", "test", "copy"]);
  });

  it("un rombo es un paso entre el bloque del que sale y el que sigue", () => {
    const a = {
      title: "", base: "", head: "", repo: "",
      groups: [{ id: "g", title: "", summary: "", risk: "bajo" as const }],
      blocks: ["parse", "cents"].map(block),
      edges: [],
      decisions: [{ id: "d", from: "parse", condition: "", status: "nueva" as const, summary: "", evidence: "", outcomes: [{ id: "si", label: "sí", to: "cents" }, { id: "no", label: "no", end: { label: "400", tone: "error" as const } }] }],
      tour: ["parse", "cents"],
    };
    const s = computeSteps(a);
    expect(s.order).toEqual(["parse", "d", "cents"]);
    expect(s.labels).toEqual({ parse: "1", d: "2", cents: "3" });
    // Si el recorrido ya trae el rombo, no lo cuenta dos veces
    expect(computeSteps({ ...a, tour: ["parse", "d", "cents"] }).labels.d).toBe("2");
  });

  it("no se cuelga con ciclos", () => {
    const s = setup([edge("a", "b"), edge("b", "a")], ["a", "b"]);
    expect(Object.keys(s.labels).sort()).toEqual(["a", "b"]);
  });
});
