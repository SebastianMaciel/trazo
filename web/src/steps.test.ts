import { describe, expect, it } from "vitest";
import type { Analysis, Block, Edge } from "../../src/shared/analysis";
import { computeSteps } from "./steps";

const block = (id: string): Block => ({ id, group: "g", title: id, file: "", kind: "función", summary: "", rows: [], hunks: [] });
const context: Analysis["context"] = { before: "", problem: "", goal: "", verdict: { status: "resuelve", text: "" } };
const edge = (from: string, to: string, kind: Edge["kind"] = "datos"): Edge => ({ id: `${from}-${to}`, from, to, kind, label: "", evidence: "" });

function setup(edges: Edge[], tour: string[]) {
  const analysis: Analysis = {
    title: "",
    context,
    base: "",
    head: "",
    repo: "",
    groups: [{ id: "g", title: "", summary: "", }],
    blocks: tour.map(block),
    edges,
    decisions: [],
    tour,
  };
  return computeSteps(analysis);
}

describe("computeSteps", () => {
  it("numera corrido por nivel de flujo, sin letras, y entre ramas paralelas respeta el orden de la AI", () => {
    // cents → cart → {inst, invoice}; cents → invoice también. La AI pide ver inst antes
    const flow = [edge("cents", "cart"), edge("cart", "inst"), edge("cart", "invoice"), edge("cents", "invoice")];
    const s = setup(flow, ["cents", "cart", "inst", "invoice"]);
    expect(s.labels).toEqual({ cents: "1", cart: "2", inst: "3", invoice: "4" });
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
      title: "", context, base: "", head: "", repo: "",
      groups: [{ id: "g", title: "", summary: "", }],
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

  it("recorre grupo por grupo en el orden de los grupos, aunque el flujo cruce de uno a otro", () => {
    const a: Analysis = {
      title: "", context, base: "", head: "", repo: "",
      groups: [{ id: "g1", title: "", summary: "" }, { id: "g2", title: "", summary: "" }],
      blocks: [{ ...block("a"), group: "g1" }, { ...block("x"), group: "g2" }, { ...block("b"), group: "g1" }, { ...block("y"), group: "g2" }],
      edges: [edge("a", "x"), edge("x", "b"), edge("b", "y")],
      decisions: [],
      tour: ["a", "x", "b", "y"],
    };
    const s = computeSteps(a);
    expect(s.order).toEqual(["a", "b", "x", "y"]);
    expect(s.labels).toEqual({ a: "1", b: "2", x: "3", y: "4" });
  });

  it("no se cuelga con ciclos", () => {
    const s = setup([edge("a", "b"), edge("b", "a")], ["a", "b"]);
    expect(Object.keys(s.labels).sort()).toEqual(["a", "b"]);
  });
});
