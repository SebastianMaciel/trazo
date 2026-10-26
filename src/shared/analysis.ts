import type { DiffLine } from "./diff.js";

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

/** Explicación de una o varias líneas seguidas, para no tener que leer el código pelado */
export interface LineNote {
  /** Índices en hunk.lines, inclusive */
  from: number;
  to: number;
  text: string;
}

export interface HunkView {
  file: string;
  section: string;
  lines: DiffLine[];
  notes?: LineNote[];
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

/** En qué estado quedó una condición respecto de la rama base */
export type DecisionStatus = "nueva" | "cambió" | "igual";

/** A dónde lleva una salida: a otro bloque, o termina ahí (responde un error, corta el flujo) */
export interface Outcome {
  id: string;
  /** "sí" / "no", o el valor del caso */
  label: string;
  to?: string;
  toRow?: string;
  end?: { label: string; tone: "error" | "ok" };
}

/** Un dato concreto y por qué salida se va */
export interface DecisionCase {
  input: string;
  outcome: string;
  /** Si antes del cambio se iba por otro lado (o no existía la condición) */
  before?: string;
  /** Algo que conviene saber aunque tome el camino esperado */
  warning?: string;
}

/** Un punto donde el flujo se divide: pasa por una salida o por la otra, nunca por las dos */
export interface Decision {
  id: string;
  /** De qué bloque viene el dato que se evalúa */
  from: string;
  fromRow?: string;
  condition: string;
  status: DecisionStatus;
  summary: string;
  /** archivo:línea del if */
  evidence: string;
  outcomes: Outcome[];
  cases?: DecisionCase[];
  hunk?: HunkView;
}

/** Qué tanto resuelve el PR lo que se quería */
export type PrVerdict = "resuelve" | "con-detalles" | "no-resuelve";

/** El contexto para alguien que llega con la cabeza en otra cosa: de dónde venimos y adónde queremos llegar */
export interface Context {
  /** Cómo andaba antes */
  before: string;
  /** Qué salía mal, con un caso concreto */
  problem: string;
  /** Cómo debería andar */
  goal: string;
  /** Qué tanto lo logra este PR, y qué falta revisar */
  verdict: { status: PrVerdict; text: string };
}

export interface Analysis {
  title: string;
  context: Context;
  base: string;
  head: string;
  repo: string;
  groups: Group[];
  blocks: Block[];
  edges: Edge[];
  decisions: Decision[];
  tour: string[];
}
