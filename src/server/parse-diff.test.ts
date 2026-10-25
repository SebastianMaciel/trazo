import { describe, expect, it } from "vitest";
import { parseDiff } from "./parse-diff.js";

const MODIFIED = `diff --git a/src/money.ts b/src/money.ts
index 1111111..2222222 100644
--- a/src/money.ts
+++ b/src/money.ts
@@ -1,4 +1,4 @@ export function toCents(amount: number)
 export function toCents(amount: number) {
-  return Math.floor(amount * 100);
+  return Math.round(amount * 100);
 }
 
@@ -10,2 +10,3 @@ export function format()
 const a = 1;
+const b = 2;
 const c = 3;
\\ No newline at end of file
`;

describe("parseDiff", () => {
  it("parsea un archivo modificado con dos hunks y numera las líneas", () => {
    const [f] = parseDiff(MODIFIED);
    expect(f).toMatchObject({ oldPath: "src/money.ts", newPath: "src/money.ts", status: "modified", additions: 2, deletions: 1 });
    expect(f.hunks).toHaveLength(2);
    expect(f.hunks[0]).toMatchObject({ id: "src/money.ts#1,1", section: "export function toCents(amount: number)" });
    expect(f.hunks[0].lines.map((l) => [l.kind, l.oldNo, l.newNo])).toEqual([
      ["ctx", 1, 1],
      ["del", 2, null],
      ["add", null, 2],
      ["ctx", 3, 3],
      ["ctx", 4, 4],
    ]);
    expect(f.hunks[1].lines.map((l) => l.text)).toEqual(["const a = 1;", "const b = 2;", "const c = 3;"]);
  });

  it("detecta archivos nuevos, borrados, renombrados y binarios", () => {
    const text = `diff --git a/new.ts b/new.ts
new file mode 100644
--- /dev/null
+++ b/new.ts
@@ -0,0 +1 @@
+export const x = 1;
diff --git a/old.ts b/old.ts
deleted file mode 100644
--- a/old.ts
+++ /dev/null
@@ -1 +0,0 @@
-export const y = 2;
diff --git a/a.ts b/b.ts
similarity index 100%
rename from a.ts
rename to b.ts
diff --git a/logo.png b/logo.png
Binary files a/logo.png and b/logo.png differ
`;
    const files = parseDiff(text);
    expect(files.map((f) => [f.status, f.oldPath, f.newPath, f.binary])).toEqual([
      ["added", null, "new.ts", false],
      ["deleted", "old.ts", null, false],
      ["renamed", "a.ts", "b.ts", false],
      ["modified", "logo.png", "logo.png", true],
    ]);
    expect(files[0].hunks[0]).toMatchObject({ oldLines: 0, newStart: 1, newLines: 1, id: "new.ts#0,1" });
  });

  it("no confunde una línea borrada que empieza con -- con un header", () => {
    const text = `diff --git a/x.sql b/x.sql
--- a/x.sql
+++ b/x.sql
@@ -1,2 +1,1 @@
--- comentario sql
 select 1;
`;
    const [f] = parseDiff(text);
    expect(f.oldPath).toBe("x.sql");
    expect(f.hunks[0].lines[0]).toMatchObject({ kind: "del", text: "-- comentario sql" });
  });

  it("devuelve vacío si no hay diff", () => {
    expect(parseDiff("")).toEqual([]);
  });
});
