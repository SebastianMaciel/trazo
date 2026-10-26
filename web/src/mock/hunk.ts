import type { DiffLine } from "../../../src/shared/diff";
import type { HunkView, LineNote } from "../../../src/shared/analysis";

/**
 * Arma un hunk a partir de líneas con prefijo +, - o espacio.
 * Una línea "#> texto" abre una nota que explica las líneas de abajo, hasta la próxima "#>" o un "#."
 */
export function hunk(file: string, section: string, oldStart: number, newStart: number, body: string): HunkView {
  let o = oldStart;
  let n = newStart;
  const lines: DiffLine[] = [];
  const notes: LineNote[] = [];
  let open: LineNote | null = null;
  const close = () => {
    if (open && open.to >= open.from) notes.push(open);
    open = null;
  };
  for (const raw of body.replace(/^\n/, "").replace(/\n$/, "").split("\n")) {
    if (raw.startsWith("#>")) {
      close();
      open = { from: lines.length, to: lines.length - 1, text: raw.slice(2).trim() };
      continue;
    }
    if (raw.startsWith("#.")) {
      close();
      continue;
    }
    const c = raw[0];
    const text = raw.slice(1);
    if (c === "+") lines.push({ kind: "add", oldNo: null, newNo: n++, text });
    else if (c === "-") lines.push({ kind: "del", oldNo: o++, newNo: null, text });
    else lines.push({ kind: "ctx", oldNo: o++, newNo: n++, text });
    if (open) (open as LineNote).to = lines.length - 1;
  }
  close();
  return notes.length ? { file, section, lines, notes } : { file, section, lines };
}
