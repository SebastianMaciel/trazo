import type { DiffLine } from "./diff.js";

export type Risk = "alto" | "medio" | "bajo";
export type BlockKind = "endpoint" | "función" | "componente" | "tipo" | "config" | "test" | "copy";
/** affected = no cambió ninguna línea, pero le llegan datos distintos */
export type RowChange = "added" | "modified" | "deleted" | "affected";
export type EdgeKind = "llama" | "importa" | "usa-tipo" | "datos" | "testea";

export interface Row {
  id: string;
  change: RowChange;
  label: string;
  /** Para modified: lo que había antes (se muestra tachado) */
  before?: string;
}

export interface HunkView {
  file: string;
  section: string;
  lines: DiffLine[];
}

export interface Example {
  input: string;
  before: string;
  after: string;
  /** true si salió de ejecutar código o un test, false si lo estimó la AI */
  executed: boolean;
}

export interface Block {
  id: string;
  group: string;
  title: string;
  file: string;
  kind: BlockKind;
  risk: Risk;
  summary: string;
  warnings?: string[];
  rows: Row[];
  hunks: HunkView[];
  example?: Example;
  /** Ninguna línea cambió, aparece porque lo afecta otro cambio */
  affected?: boolean;
}

export interface Group {
  id: string;
  title: string;
  summary: string;
  risk: Risk;
  minor?: boolean;
}

export interface Edge {
  id: string;
  from: string;
  to: string;
  fromRow?: string;
  toRow?: string;
  kind: EdgeKind;
  label: string;
  /** archivo:línea donde se ve la relación */
  evidence: string;
}

export interface Analysis {
  title: string;
  base: string;
  head: string;
  repo: string;
  groups: Group[];
  blocks: Block[];
  edges: Edge[];
  tour: string[];
}
