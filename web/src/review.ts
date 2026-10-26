import type { Analysis, HunkView } from "../../src/shared/analysis";
import type { DiffLine } from "../../src/shared/diff";
import type { Verdict } from "./store";

/** Imports, comentarios y líneas vacías: no explican el cambio */
const NOISE = /^\s*(import\b|export \* from|\/\/|\/\*|\*)|^\s*$/;
const WARN = /\bojo:/i;
const meaningful = (l: DiffLine) => l.kind !== "ctx" && !NOISE.test(l.text);

/** Qué mostrar del hunk: la nota con "Ojo" si hay, si no la primera que toca código de verdad */
export function focusOf(h: HunkView) {
  const notes = h.notes ?? [];
  const note = notes.find((n) => WARN.test(n.text)) ?? notes.find((n) => h.lines.slice(n.from, n.to + 1).some(meaningful));
  const span = note ? h.lines.slice(note.from, note.to + 1) : h.lines;
  const lines = span.filter(meaningful);
  return { lines: lines.length ? lines : span.filter((l) => l.kind !== "ctx"), note: note?.text, warn: !!note && WARN.test(note.text) };
}

/** De todos los hunks del bloque, el que tiene el aviso; si no, el primero con código que importe */
export function focusHunk(hunks: HunkView[]): HunkView | undefined {
  return hunks.find((h) => h.notes?.some((n) => WARN.test(n.text))) ?? hunks.find((h) => h.lines.some(meaningful)) ?? hunks[0];
}

export interface Step {
  id: string;
  title: string;
  /** archivo:línea para ubicarlo en el PR */
  where: string;
  /** Lo que avisó la AI sobre este paso */
  warnings: string[];
}

/** Un paso del recorrido (bloque o rombo) con lo necesario para nombrarlo en la review */
export function stepOf(a: Analysis, id: string): Step {
  const d = a.decisions.find((x) => x.id === id);
  if (d) return { id, title: d.condition, where: d.evidence, warnings: (d.cases ?? []).flatMap((c) => (c.warning ? [`${c.input}: ${c.warning}`] : [])) };
  const b = a.blocks.find((x) => x.id === id)!;
  const h = focusHunk(b.hunks);
  const line = h && focusOf(h).lines.find((l) => l.newNo ?? l.oldNo);
  const no = line ? (line.newNo ?? line.oldNo) : null;
  return { id, title: b.title, where: no ? `${b.file}:${no}` : b.file, warnings: b.warnings ?? [] };
}

export type ReviewStatus = "cambios" | "dudas" | "pendiente" | "aprobado";

export interface ReviewSummary {
  status: ReviewStatus;
  changes: (Step & { note: string })[];
  doubts: (Step & { note: string })[];
  /** Pasos con aviso de la AI que diste por buenos: conviene que sea a conciencia */
  okWithWarnings: Step[];
  pending: Step[];
  draft: string;
}

const HEADLINE: Record<ReviewStatus, string> = {
  cambios: "Pido cambios",
  dudas: "Tengo dudas antes de aprobar",
  pendiente: "Review a medias",
  aprobado: "Aprobado",
};

/** Lo que cerró el revisor, ordenado como lo necesita el autor del PR */
export function summarize(a: Analysis, tour: string[], verdicts: Record<string, Verdict>, notes: Record<string, string>): ReviewSummary {
  const steps = tour.map((id) => stepOf(a, id));
  const withNote = (v: Verdict) => steps.filter((s) => verdicts[s.id] === v).map((s) => ({ ...s, note: notes[s.id]?.trim() ?? "" }));
  const changes = withNote("change");
  const doubts = withNote("doubt");
  const okWithWarnings = steps.filter((s) => verdicts[s.id] === "ok" && s.warnings.length);
  const pending = steps.filter((s) => !verdicts[s.id]);
  const status: ReviewStatus = changes.length ? "cambios" : doubts.length ? "dudas" : pending.length ? "pendiente" : "aprobado";

  const item = (s: Step & { note: string }, i: number) => `${i + 1}. \`${s.title}\` (${s.where})${s.note ? `: ${s.note}` : ""}`;
  const draft = [
    `**${HEADLINE[status]}**`,
    ...(changes.length ? ["", "Cambios:", ...changes.map(item)] : []),
    ...(doubts.length ? ["", "Dudas:", ...doubts.map(item)] : []),
    ...(status === "aprobado" ? ["", "Recorrí todo el cambio y me cierra."] : []),
  ].join("\n");

  return { status, changes, doubts, okWithWarnings, pending, draft };
}

export { HEADLINE };
