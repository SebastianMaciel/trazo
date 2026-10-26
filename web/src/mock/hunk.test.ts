import { describe, expect, it } from "vitest";
import { hunk } from "./hunk";

describe("hunk", () => {
  it("las notas cubren las líneas de abajo y no cuentan como código", () => {
    const h = hunk("a.ts", "", 10, 10, `
 const a = 1;
#> Corta si no hay cupón
+if (!c) {
+  return;
+}
#.
 const b = 2;
#> Ya no suma dos cupones
-const t = x + y;`);
    expect(h.lines.map((l) => l.newNo ?? l.oldNo)).toEqual([10, 11, 12, 13, 14, 12]);
    expect(h.notes).toEqual([
      { from: 1, to: 3, text: "Corta si no hay cupón" },
      { from: 5, to: 5, text: "Ya no suma dos cupones" },
    ]);
  });

  it("sin notas no agrega el campo", () => {
    expect(hunk("a.ts", "", 1, 1, "+x").notes).toBeUndefined();
  });
});
