import type { DiffLine, FileDiff, Hunk } from "../shared/diff.js";

const HUNK_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@ ?(.*)$/;

/** Saca el prefijo a/ b/ y las comillas que git pone en paths raros */
function cleanPath(raw: string): string | null {
  let p = raw.trim();
  if (p.startsWith('"') && p.endsWith('"')) p = JSON.parse(p);
  if (p === "/dev/null") return null;
  return p.replace(/^[ab]\//, "");
}

/** Parsea la salida de `git diff` (formato unified) */
export function parseDiff(text: string): FileDiff[] {
  const files: FileDiff[] = [];
  let file: FileDiff | null = null;
  let hunk: Hunk | null = null;
  let oldNo = 0;
  let newNo = 0;

  for (const line of text.split("\n")) {
    if (line.startsWith("diff --git ")) {
      const m = line.match(/^diff --git (\S+) (\S+)$/);
      file = {
        oldPath: m ? cleanPath(m[1]) : null,
        newPath: m ? cleanPath(m[2]) : null,
        status: "modified",
        binary: false,
        additions: 0,
        deletions: 0,
        hunks: [],
      };
      files.push(file);
      hunk = null;
      continue;
    }
    if (!file) continue;

    if (hunk) {
      const c = line[0];
      if (c === "+" || c === "-" || c === " ") {
        const l: DiffLine =
          c === "+"
            ? { kind: "add", oldNo: null, newNo: newNo++, text: line.slice(1) }
            : c === "-"
              ? { kind: "del", oldNo: oldNo++, newNo: null, text: line.slice(1) }
              : { kind: "ctx", oldNo: oldNo++, newNo: newNo++, text: line.slice(1) };
        if (l.kind === "add") file.additions++;
        if (l.kind === "del") file.deletions++;
        hunk.lines.push(l);
        continue;
      }
      if (line.startsWith("\\")) continue; // "\ No newline at end of file"
    }

    const hm = line.match(HUNK_RE);
    if (hm) {
      oldNo = Number(hm[1]);
      newNo = Number(hm[3]);
      hunk = {
        id: "",
        oldStart: oldNo,
        oldLines: hm[2] === undefined ? 1 : Number(hm[2]),
        newStart: newNo,
        newLines: hm[4] === undefined ? 1 : Number(hm[4]),
        section: hm[5].trim(),
        lines: [],
      };
      file.hunks.push(hunk);
      continue;
    }

    if (line.startsWith("new file mode")) file.status = "added";
    else if (line.startsWith("deleted file mode")) file.status = "deleted";
    else if (line.startsWith("rename from ")) {
      file.status = "renamed";
      file.oldPath = cleanPath(line.slice(12));
    } else if (line.startsWith("rename to ")) {
      file.status = "renamed";
      file.newPath = cleanPath(line.slice(10));
    } else if (line.startsWith("Binary files ")) file.binary = true;
    else if (line.startsWith("--- ")) file.oldPath = cleanPath(line.slice(4));
    else if (line.startsWith("+++ ")) file.newPath = cleanPath(line.slice(4));
  }

  for (const f of files) {
    if (f.status === "added") f.oldPath = null;
    if (f.status === "deleted") f.newPath = null;
    const path = f.newPath ?? f.oldPath;
    for (const h of f.hunks) h.id = `${path}#${h.oldStart},${h.newStart}`;
  }
  return files;
}
