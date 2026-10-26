import { describe, expect, it } from "vitest";
import type { Analysis, Block } from "../../src/shared/analysis";
import { summarize } from "./review";

const block = (id: string, title: string, warnings?: string[]): Block => ({
  id,
  group: "g",
  title,
  file: "src/coupons.ts",
  kind: "función",
  summary: "",
  rows: [{ id: `${id}-r`, change: "modified", label: "x" }],
  warnings,
  hunks: [
    {
      file: "src/coupons.ts",
      section: "",
      lines: [
        { kind: "ctx", oldNo: 11, newNo: 11, text: "export function isCouponActive(c: Coupon) {" },
        { kind: "add", oldNo: null, newNo: 12, text: "  return today < c.expiresOn;" },
      ],
      notes: [{ from: 1, to: 1, text: "Ojo: el último día ya no vale" }],
    },
  ],
});

const a: Analysis = {
  title: "Cupones",
  context: { before: "", problem: "", goal: "", verdict: { status: "con-detalles", text: "" } },
  base: "main",
  head: "fix",
  repo: "demo",
  groups: [{ id: "g", title: "Cupones", summary: "" }],
  blocks: [block("b-active", "isCouponActive", ["El día del vencimiento ya no vale"]), block("b-min", "meetsMinimum")],
  edges: [],
  decisions: [],
  tour: ["b-active", "b-min"],
};
const tour = a.blocks.map((b) => b.id);

describe("summarize", () => {
  it("si pedís un cambio, la review pide cambios y el borrador lo nombra con archivo y línea", () => {
    const s = summarize(a, tour, { "b-active": "change" }, { "b-active": "usar <=" });
    expect(s.status).toBe("cambios");
    expect(s.changes).toHaveLength(1);
    expect(s.draft).toContain("**Pido cambios**");
    expect(s.draft).toMatch(/`isCouponActive` \(src\/coupons\.ts:\d+\): usar <=/);
  });

  it("dudas sin cambios: no aprueba", () => {
    expect(summarize(a, tour, { "b-active": "doubt" }, {}).status).toBe("dudas");
  });

  it("todo bien pero sin terminar: queda pendiente; todo bien y completo: aprobado", () => {
    expect(summarize(a, tour, { "b-active": "ok" }, {}).status).toBe("pendiente");
    const all = Object.fromEntries(tour.map((id) => [id, "ok" as const]));
    const s = summarize(a, tour, all, {});
    expect(s.status).toBe("aprobado");
    // Los avisos que diste por buenos quedan a la vista
    expect(s.okWithWarnings.map((x) => x.id)).toContain("b-active");
  });
});
