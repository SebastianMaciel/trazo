import { describe, expect, it } from "vitest";
import { cuponesAnalysis } from "./mock/cupones-acumulados";
import { summarize } from "./review";

const a = cuponesAnalysis;
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
