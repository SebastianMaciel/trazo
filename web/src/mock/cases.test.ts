import { describe, expect, it } from "vitest";
import { cases } from ".";

describe.each(cases.map((c) => [c.head, c] as const))("caso %s", (_, a) => {
  it("toda flecha sale de una fila de su bloque", () => {
    for (const e of a.edges) {
      const rows = a.blocks.find((b) => b.id === e.from)?.rows.map((r) => r.id) ?? [];
      expect(rows, `${e.id} sale de ${e.from} sin fila`).toContain(e.fromRow);
    }
  });

  it("todo rombo sale de una fila de su bloque", () => {
    for (const d of a.decisions) {
      const rows = a.blocks.find((b) => b.id === d.from)?.rows.map((r) => r.id) ?? [];
      expect(rows, `${d.id} sale de ${d.from} sin fila`).toContain(d.fromRow);
    }
  });
});
