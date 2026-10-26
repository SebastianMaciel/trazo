import { describe, expect, it } from "vitest";
import type { DiffResult } from "../shared/diff.js";
import { renderNumbered } from "./numbered.js";
import { parseDiff } from "./parse-diff.js";
import { validateDraft } from "./validate.js";

const RAW = `diff --git a/src/cart.ts b/src/cart.ts
--- a/src/cart.ts
+++ b/src/cart.ts
@@ -1,3 +1,3 @@ export function total
 const a = 1;
-const b = 2;
+const b = 3;
 const c = 4;
diff --git a/src/tax.ts b/src/tax.ts
--- a/src/tax.ts
+++ b/src/tax.ts
@@ -5,2 +5,2 @@
-export const IVA = 1.2;
+export const IVA = 1.21;
`;

const diff: DiffResult = { base: { ref: "main", sha: "b".repeat(40) }, head: { ref: "fix", sha: "h".repeat(40) }, mergeBase: "m".repeat(40), files: parseDiff(RAW) };
// Los archivos existen y tienen 50 líneas, salvo los que no están en el repo
const lines = async (_sha: string, path: string) => (path.startsWith("src/") ? 50 : null);

const draft = () => ({
  base: diff.base.sha,
  head: diff.head.sha,
  headLabel: "!12 fix",
  title: "IVA al 21%",
  context: { before: "a", problem: "b", goal: "c", verdict: { status: "resuelve", text: "d" } },
  groups: [{ id: "g", title: "El IVA", summary: "s" }],
  blocks: [
    { id: "cart", group: "g", title: "total", file: "src/cart.ts", kind: "función", summary: "s", rows: [{ id: "r1", change: "modified", label: "b vale 3", before: "b valía 2" }], hunks: [{ id: "h1", notes: [{ from: 1, to: 2, text: "cambia b" }] }] },
    { id: "tax", group: "g", title: "IVA", file: "src/tax.ts", kind: "config", summary: "s", rows: [{ id: "r2", change: "modified", label: "21%" }], hunks: [{ id: "h2" }] },
  ],
  edges: [{ id: "e1", from: "tax", to: "cart", fromRow: "r2", toRow: "r1", kind: "datos", label: "IVA", evidence: "src/cart.ts:2" }],
  decisions: [],
  tour: ["tax", "cart"],
});

describe("renderNumbered", () => {
  it("numera los hunks y cada línea con su índice y sus números viejo y nuevo", () => {
    const text = renderNumbered(diff);
    expect(text).toContain("[h1] @@ -1,3 +1,3 @@ export function total");
    expect(text).toContain("[h2] @@ -5,2 +5,2 @@");
    expect(text).toContain("\n  1 2   - const b = 2;\n  2   2 + const b = 3;\n");
  });
});

describe("validateDraft", () => {
  it("convierte el borrador en análisis con el código real del diff", async () => {
    const { errors, analysis } = await validateDraft(draft(), diff, "demo", lines);
    expect(errors).toEqual([]);
    expect(analysis!.head).toBe("!12 fix");
    expect(analysis!.key).toBe("demo-mmmmmmmmmm-hhhhhhhhhh");
    expect(analysis!.blocks[0].hunks[0]).toMatchObject({ file: "src/cart.ts", section: "export function total", notes: [{ from: 1, to: 2, text: "cambia b" }] });
    expect(analysis!.blocks[0].hunks[0].lines.map((l) => l.text)).toEqual(["const a = 1;", "const b = 2;", "const b = 3;", "const c = 4;"]);
  });

  it("no deja código afuera del review ni un hunk en dos bloques", async () => {
    const d = draft();
    d.blocks[1].hunks = [{ id: "h1" }];
    const { errors } = await validateDraft(d, diff, "demo", lines);
    expect(errors.join("\n")).toMatch(/h2 \(src\/tax.ts\)/);
    expect(errors.join("\n")).toMatch(/ya están en el bloque "cart"/);
  });

  it("un hunk que toca dos funciones se reparte entre bloques por líneas, y ninguna cambiada queda afuera", async () => {
    const d = draft();
    // h1: 0 contexto, 1 borrada, 2 agregada, 3 contexto. La borrada a cart, la agregada a tax
    d.blocks[0].hunks = [{ id: "h1", lines: [0, 1], notes: [{ from: 1, to: 1, text: "se va b = 2" }] } as never];
    d.blocks[1].hunks = [{ id: "h2" }, { id: "h1", lines: [2, 3], notes: [{ from: 2, to: 2, text: "llega b = 3" }] } as never];
    const ok = await validateDraft(d, diff, "demo", lines);
    expect(ok.errors).toEqual([]);
    const tax = ok.analysis!.blocks[1].hunks[1];
    expect(tax.lines.map((l) => l.text)).toEqual(["const b = 3;", "const c = 4;"]);
    // Las notas quedan relativas al pedazo
    expect(tax.notes).toEqual([{ from: 0, to: 0, text: "llega b = 3" }]);

    d.blocks[1].hunks = [{ id: "h2" }];
    const orphan = await validateDraft(d, diff, "demo", lines);
    expect(orphan.errors.join("\n")).toMatch(/h1 líneas 2 \(src\/cart.ts\)/);

    d.blocks[1].hunks = [{ id: "h2" }, { id: "h1", lines: [1, 3] } as never];
    const clash = await validateDraft(d, diff, "demo", lines);
    expect(clash.errors.join("\n")).toMatch(/hunk h1 ya están en el bloque "cart"/);
  });

  it("rechaza hunks inventados y notas fuera del hunk", async () => {
    const d = draft();
    d.blocks[0].hunks = [{ id: "h9", notes: [] }, { id: "h1", notes: [{ from: 0, to: 7, text: "x" }] }];
    const { errors } = await validateDraft(d, diff, "demo", lines);
    expect(errors.join("\n")).toMatch(/no existe el hunk "h9"/);
    expect(errors.join("\n")).toMatch(/entre 0 y 3/);
  });

  it("toda flecha sale de una fila y tiene evidencia que existe", async () => {
    const d = draft();
    d.edges[0] = { ...d.edges[0], fromRow: "nada", evidence: "src/cart.ts:99" };
    d.edges.push({ ...d.edges[0], id: "e2", fromRow: "r2", evidence: "otro/archivo.ts:1" });
    const { errors } = await validateDraft(d, diff, "demo", lines);
    const all = errors.join("\n");
    expect(all).toMatch(/edges\[0\]\.fromRow: .*fila del bloque "tax"/);
    expect(all).toMatch(/tiene 50 líneas, no existe la 99/);
    expect(all).toMatch(/"otro\/archivo.ts" no existe/);
  });

  it("el análisis es del diff que se le dio, y el recorrido tiene todos los bloques", async () => {
    const d = { ...draft(), head: "otro", tour: ["tax", "fantasma"] };
    const { errors } = await validateDraft(d, diff, "demo", lines);
    const all = errors.join("\n");
    expect(all).toMatch(/^head: /m);
    expect(all).toMatch(/no existe el bloque o rombo "fantasma"/);
    expect(all).toMatch(/faltan estos bloques en el recorrido: cart/);
  });
});
