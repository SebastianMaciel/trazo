import { filePath, type DiffResult, type FileDiff, type Hunk } from "../shared/diff.js";

export interface NumberedHunk {
  id: string;
  file: FileDiff;
  hunk: Hunk;
}

/** Cada hunk del diff con un id corto y estable en orden: h1, h2… Es lo que el agente usa para nombrarlos */
export function numberHunks(d: DiffResult): NumberedHunk[] {
  let n = 0;
  return d.files.flatMap((file) => file.hunks.map((hunk) => ({ id: `h${++n}`, file, hunk })));
}

const STATUS = { added: "nuevo", deleted: "borrado", modified: "modificado", renamed: "renombrado" } as const;
const pad = (v: number | null, w: number) => (v === null ? "" : String(v)).padStart(w);

/**
 * El diff como texto para el agente. Cada línea lleva su índice dentro del hunk (para las notas)
 * y sus números de línea viejo y nuevo (para la evidencia archivo:línea)
 */
export function renderNumbered(d: DiffResult): string {
  const hunks = numberHunks(d);
  const adds = d.files.reduce((s, f) => s + f.additions, 0);
  const dels = d.files.reduce((s, f) => s + f.deletions, 0);
  const out = [
    `base ${d.base.sha} (${d.base.ref})`,
    `head ${d.head.sha} (${d.head.ref})`,
    `merge-base ${d.mergeBase}`,
    `${d.files.length} archivos · ${hunks.length} hunks · +${adds} −${dels}`,
    "",
    "Cada línea: índice en el hunk · número viejo · número nuevo · marca · código",
  ];
  for (const f of d.files) {
    const rename = f.status === "renamed" ? ` (antes ${f.oldPath})` : "";
    out.push("", `=== ${filePath(f)}${rename} · ${STATUS[f.status]} · +${f.additions} −${f.deletions}${f.binary ? " · binario, sin hunks" : ""}`);
    for (const h of hunks.filter((x) => x.file === f)) {
      const { hunk } = h;
      out.push("", `[${h.id}] @@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@ ${hunk.section}`.trimEnd());
      const w = String(Math.max(hunk.oldStart + hunk.oldLines, hunk.newStart + hunk.newLines)).length;
      hunk.lines.forEach((l, i) => {
        const mark = l.kind === "add" ? "+" : l.kind === "del" ? "-" : " ";
        out.push(`${String(i).padStart(3)} ${pad(l.oldNo, w)} ${pad(l.newNo, w)} ${mark} ${l.text}`);
      });
    }
  }
  return out.join("\n") + "\n";
}
