import type { DiffLine } from "../../../src/shared/diff";
import type { HunkView } from "../../../src/shared/analysis";

/** Arma un hunk a partir de líneas con prefijo +, - o espacio */
export function hunk(file: string, section: string, oldStart: number, newStart: number, body: string): HunkView {
  let o = oldStart;
  let n = newStart;
  const lines: DiffLine[] = body
    .replace(/^\n/, "")
    .replace(/\n$/, "")
    .split("\n")
    .map((raw) => {
      const c = raw[0];
      const text = raw.slice(1);
      if (c === "+") return { kind: "add", oldNo: null, newNo: n++, text };
      if (c === "-") return { kind: "del", oldNo: o++, newNo: null, text };
      return { kind: "ctx", oldNo: o++, newNo: n++, text };
    });
  return { file, section, lines };
}
