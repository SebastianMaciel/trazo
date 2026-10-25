export type LineKind = "add" | "del" | "ctx";

export interface DiffLine {
  kind: LineKind;
  oldNo: number | null;
  newNo: number | null;
  text: string;
}

export interface Hunk {
  /** Estable dentro de un diff: `path#oldStart,newStart` */
  id: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  /** Contexto que git pone después del @@ (suele ser la función que contiene el hunk) */
  section: string;
  lines: DiffLine[];
}

export type FileStatus = "added" | "deleted" | "modified" | "renamed";

export interface FileDiff {
  oldPath: string | null;
  newPath: string | null;
  status: FileStatus;
  binary: boolean;
  additions: number;
  deletions: number;
  hunks: Hunk[];
}

export interface DiffResult {
  base: { ref: string; sha: string };
  head: { ref: string; sha: string };
  /** Punto desde donde se compara: merge-base(base, head), como en un PR */
  mergeBase: string;
  files: FileDiff[];
}

export interface Branch {
  name: string;
  sha: string;
  current: boolean;
  /** Si la rama está checkouteada en un worktree, su carpeta */
  worktree: string | null;
}

export interface RepoInfo {
  root: string;
  name: string;
  defaultBase: string;
  branches: Branch[];
}

export const filePath = (f: FileDiff) => (f.newPath ?? f.oldPath)!;
