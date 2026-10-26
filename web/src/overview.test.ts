import { describe, expect, it } from "vitest";
import type { Graph, Wire } from "./graph";
import { groupLinks, overviewCols } from "./overview";

const wire = (id: string, source: string, target: string, kind: Wire["kind"] = "datos"): Wire => ({ id, source, sourceHandle: "", target, targetHandle: "", kind, label: "", evidence: "" });

describe("groupLinks", () => {
  it("suma los cables que cruzan de un grupo a otro e ignora los de adentro y los de test", () => {
    const g: Graph = {
      nodes: [
        { id: "a", kind: "block", group: "g1" },
        { id: "b", kind: "block", group: "g1" },
        { id: "d", kind: "decision", group: "g1" },
        { id: "x", kind: "block", group: "g2" },
        { id: "t", kind: "block", group: "g3" },
      ],
      wires: [wire("1", "a", "b"), wire("2", "a", "x"), wire("3", "d", "x", "salida"), wire("4", "x", "t", "testea"), wire("5", "x", "a")],
    };
    expect(groupLinks(g)).toEqual([
      { from: "g1", to: "g2", count: 2 },
      { from: "g2", to: "g1", count: 1 },
    ]);
  });
});

describe("overviewCols", () => {
  it("nunca más de 3 por fila y 4 grupos van de a 2", () => {
    expect([1, 2, 3, 4, 5, 9].map(overviewCols)).toEqual([1, 2, 3, 2, 3, 3]);
  });
});
