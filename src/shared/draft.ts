import type { Block, Context, Decision, Edge, Group, LineNote } from "./analysis.js";

/**
 * Lo que escribe el agente. Es el Analysis sin código: los hunks se nombran por id ("h3")
 * y las notas apuntan a índices de línea de ese hunk, tal como salen en el diff numerado.
 * El código lo pone trazo desde el diff real, así la AI no puede inventar ni copiar mal.
 */
export interface DraftHunk {
  id: string;
  notes?: LineNote[];
}

export interface Draft {
  /** sha de la base y del head, los que imprimió `trazo diff` */
  base: string;
  head: string;
  /** Cómo mostrarlos: "develop", "!123 feature/cupones" */
  baseLabel?: string;
  headLabel?: string;
  title: string;
  context: Context;
  groups: Group[];
  blocks: (Omit<Block, "hunks"> & { hunks: DraftHunk[] })[];
  edges: Edge[];
  decisions: (Omit<Decision, "hunk"> & { hunk?: DraftHunk })[];
  tour: string[];
}
