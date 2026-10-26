import type { Analysis, Block, Decision, HunkView } from "../shared/analysis.js";
import { filePath, type DiffResult } from "../shared/diff.js";
import type { Draft } from "../shared/draft.js";
import { numberHunks } from "./numbered.js";

const KINDS = ["endpoint", "función", "componente", "tipo", "config", "test", "copy"];
const ROW_CHANGES = ["added", "modified", "deleted", "affected"];
const EDGE_KINDS = ["llama", "importa", "usa-tipo", "datos", "testea"];
const DECISION_STATUS = ["nueva", "cambió", "igual"];
const PR_VERDICTS = ["resuelve", "con-detalles", "no-resuelve"];
const TONES = ["error", "ok"];

/** Cuántas líneas tiene un archivo en un commit, o null si ahí no existe */
export type LineCounter = (sha: string, path: string) => Promise<number | null>;

export interface Validation {
  errors: string[];
  analysis?: Analysis;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Valida lo que escribió el agente contra el diff real y lo convierte en el análisis que dibuja la web.
 * Junta todos los errores de una pasada: el agente los corrige todos juntos y vuelve a validar
 */
export async function validateDraft(raw: unknown, diff: DiffResult, repo: string, lines: LineCounter): Promise<Validation> {
  const errors: string[] = [];
  const err = (path: string, msg: string) => errors.push(`${path}: ${msg}`);

  const str = (o: Obj, k: string, path: string, required = true) => {
    const v = o[k];
    if (typeof v === "string" && v.trim()) return v;
    if (required || v !== undefined) err(`${path}.${k}`, "tiene que ser un texto no vacío");
    return "";
  };
  const oneOf = (o: Obj, k: string, opts: string[], path: string) => {
    const v = o[k];
    if (typeof v === "string" && opts.includes(v)) return v;
    err(`${path}.${k}`, `tiene que ser uno de: ${opts.join(", ")} (vino ${JSON.stringify(v)})`);
    return "";
  };
  const list = (o: Obj, k: string, path: string, required = true): unknown[] => {
    const v = o[k];
    if (Array.isArray(v)) return v;
    if (required || v !== undefined) err(`${path}.${k}`, "tiene que ser una lista");
    return [];
  };
  const objs = (o: Obj, k: string, path: string, required = true) =>
    list(o, k, path, required).flatMap((v, i) => {
      if (isObj(v)) return [{ v, path: `${path}.${k}[${i}]` }];
      err(`${path}.${k}[${i}]`, "tiene que ser un objeto");
      return [];
    });

  if (!isObj(raw)) return { errors: ["el archivo tiene que ser un objeto JSON"] };
  const d = raw as Obj;

  // Que el análisis sea del mismo diff que se le dio al agente
  if (d.base !== diff.base.sha) err("base", `tiene que ser el sha de la base que imprimió trazo diff (${diff.base.sha})`);
  if (d.head !== diff.head.sha) err("head", `tiene que ser el sha del head que imprimió trazo diff (${diff.head.sha})`);
  str(d, "title", "");
  if (d.baseLabel !== undefined) str(d, "baseLabel", "", false);
  if (d.headLabel !== undefined) str(d, "headLabel", "", false);

  if (!isObj(d.context)) err("context", "falta el contexto (before, problem, goal, verdict)");
  else {
    for (const k of ["before", "problem", "goal"]) str(d.context, k, "context");
    if (!isObj(d.context.verdict)) err("context.verdict", "falta { status, text }");
    else {
      oneOf(d.context.verdict, "status", PR_VERDICTS, "context.verdict");
      str(d.context.verdict, "text", "context.verdict");
    }
  }

  // Grupos
  const groupIds = new Set<string>();
  for (const { v, path } of objs(d, "groups", "")) {
    const id = str(v, "id", path);
    if (groupIds.has(id)) err(`${path}.id`, `"${id}" está repetido`);
    groupIds.add(id);
    str(v, "title", path);
    str(v, "summary", path);
  }

  // Hunks del diff y quién los usa
  const numbered = numberHunks(diff);
  const byId = new Map(numbered.map((h) => [h.id, h]));
  const owner = new Map<string, string>();

  const hunkView = (h: unknown, path: string): HunkView | null => {
    if (!isObj(h)) {
      err(path, 'tiene que ser { id: "h3", notes: [...] }');
      return null;
    }
    const id = str(h, "id", path);
    const n = byId.get(id);
    if (!n) {
      if (id) err(`${path}.id`, `no existe el hunk "${id}" en el diff (van de h1 a h${numbered.length})`);
      return null;
    }
    const max = n.hunk.lines.length - 1;
    const notes = objs(h, "notes", path, false).flatMap(({ v, path: np }) => {
      const { from, to } = v;
      const text = str(v, "text", np);
      if (!Number.isInteger(from) || !Number.isInteger(to) || (from as number) < 0 || (to as number) > max || (from as number) > (to as number)) {
        err(np, `from y to son índices de línea del hunk ${id}, entre 0 y ${max}, con from ≤ to`);
        return [];
      }
      return [{ from: from as number, to: to as number, text }];
    });
    return { file: filePath(n.file), section: n.hunk.section, lines: n.hunk.lines, notes };
  };

  // Bloques
  const blocks: Block[] = [];
  const stepIds = new Set<string>();
  for (const { v, path } of objs(d, "blocks", "")) {
    const id = str(v, "id", path);
    if (stepIds.has(id)) err(`${path}.id`, `"${id}" está repetido`);
    stepIds.add(id);
    const group = str(v, "group", path);
    if (group && !groupIds.has(group)) err(`${path}.group`, `no existe el grupo "${group}"`);
    const rowIds = new Set<string>();
    const rows = objs(v, "rows", path).map(({ v: r, path: rp }) => {
      const rid = str(r, "id", rp);
      if (rowIds.has(rid)) err(`${rp}.id`, `"${rid}" está repetido en el bloque`);
      rowIds.add(rid);
      return { id: rid, change: oneOf(r, "change", ROW_CHANGES, rp), label: str(r, "label", rp), ...(r.before !== undefined ? { before: str(r, "before", rp, false) } : {}) };
    });
    if (!rows.length) err(`${path}.rows`, "un bloque necesita al menos una fila: de ahí salen las flechas");
    const hunks = list(v, "hunks", path).flatMap((h, i) => {
      const hv = hunkView(h, `${path}.hunks[${i}]`);
      const hid = isObj(h) ? String(h.id) : "";
      if (hv) {
        const prev = owner.get(hid);
        if (prev && prev !== id) err(`${path}.hunks[${i}]`, `el hunk ${hid} ya está en el bloque "${prev}": cada hunk va en un solo bloque`);
        owner.set(hid, id);
      }
      return hv ? [hv] : [];
    });
    const warnings = list(v, "warnings", path, false).filter((w, i) => typeof w === "string" || (err(`${path}.warnings[${i}]`, "tiene que ser un texto"), false)) as string[];
    blocks.push({
      id,
      group,
      title: str(v, "title", path),
      file: str(v, "file", path),
      kind: oneOf(v, "kind", KINDS, path) as Block["kind"],
      summary: str(v, "summary", path),
      rows: rows as Block["rows"],
      hunks,
      ...(warnings.length ? { warnings } : {}),
      ...(v.affected === true ? { affected: true } : {}),
      ...(isObj(v.example) ? { example: v.example as unknown as Block["example"] } : {}),
    });
  }

  // Ningún código puede quedar afuera del review
  const orphans = numbered.filter((h) => !owner.has(h.id));
  if (orphans.length)
    err("blocks", `estos hunks no están en ningún bloque: ${orphans.map((h) => `${h.id} (${filePath(h.file)})`).join(", ")}. Si son menores, van en un bloque de un grupo con minor: true`);

  const blockById = new Map(blocks.map((b) => [b.id, b]));
  const rowOf = (blockId: string, rowId: unknown, path: string, what: string) => {
    const b = blockById.get(blockId);
    if (!b) return;
    if (typeof rowId !== "string" || !b.rows.some((r) => r.id === rowId))
      err(path, `${what} tiene que ser el id de una fila del bloque "${blockId}" (${b.rows.map((r) => r.id).join(", ")}). Si la relación está en una línea que no cambió, sumale al bloque una fila "affected"`);
  };

  // Evidencia: archivo:línea que exista en el head o en la base
  const evidenceChecks: Promise<void>[] = [];
  const evidence = (o: Obj, path: string) => {
    const ev = str(o, "evidence", path);
    const m = ev.match(/^(.+):(\d+)$/);
    if (!m) {
      if (ev) err(`${path}.evidence`, `tiene que ser "ruta/desde/la/raíz.ts:línea" (vino "${ev}")`);
      return;
    }
    const [, file, no] = m;
    evidenceChecks.push(
      (async () => {
        const [inHead, inBase] = await Promise.all([lines(diff.head.sha, file), lines(diff.mergeBase, file)]);
        const max = Math.max(inHead ?? 0, inBase ?? 0);
        if (inHead === null && inBase === null) err(`${path}.evidence`, `"${file}" no existe en el repo (la ruta va desde la raíz)`);
        else if (Number(no) < 1 || Number(no) > max) err(`${path}.evidence`, `"${file}" tiene ${max} líneas, no existe la ${no}`);
      })(),
    );
  };

  // Flechas
  const edgeIds = new Set<string>();
  const edges = objs(d, "edges", "").map(({ v, path }) => {
    const id = str(v, "id", path);
    if (edgeIds.has(id)) err(`${path}.id`, `"${id}" está repetido`);
    edgeIds.add(id);
    const from = str(v, "from", path);
    const to = str(v, "to", path);
    if (from && !blockById.has(from)) err(`${path}.from`, `no existe el bloque "${from}"`);
    if (to && !blockById.has(to)) err(`${path}.to`, `no existe el bloque "${to}"`);
    rowOf(from, v.fromRow, `${path}.fromRow`, "fromRow");
    if (v.toRow !== undefined) rowOf(to, v.toRow, `${path}.toRow`, "toRow");
    evidence(v, path);
    return { id, from, to, fromRow: v.fromRow as string, ...(v.toRow ? { toRow: v.toRow as string } : {}), kind: oneOf(v, "kind", EDGE_KINDS, path) as Analysis["edges"][number]["kind"], label: str(v, "label", path), evidence: String(v.evidence ?? "") };
  });

  // Rombos
  const decisions: Decision[] = objs(d, "decisions", "", false).map(({ v, path }) => {
    const id = str(v, "id", path);
    if (stepIds.has(id)) err(`${path}.id`, `"${id}" ya se usa en otro bloque o rombo`);
    stepIds.add(id);
    const from = str(v, "from", path);
    if (from && !blockById.has(from)) err(`${path}.from`, `no existe el bloque "${from}"`);
    rowOf(from, v.fromRow, `${path}.fromRow`, "fromRow");
    evidence(v, path);
    const outIds = new Set<string>();
    const outcomes = objs(v, "outcomes", path).map(({ v: o, path: op }) => {
      const oid = str(o, "id", op);
      outIds.add(oid);
      const to = typeof o.to === "string" ? o.to : undefined;
      if (to && !blockById.has(to)) err(`${op}.to`, `no existe el bloque "${to}"`);
      if (to && o.toRow !== undefined) rowOf(to, o.toRow, `${op}.toRow`, "toRow");
      let end: Decision["outcomes"][number]["end"];
      if (isObj(o.end)) end = { label: str(o.end, "label", `${op}.end`), tone: oneOf(o.end, "tone", TONES, `${op}.end`) as "error" | "ok" };
      if (!to && !end) err(op, 'una salida va a un bloque (to) o termina ahí (end: { label: "responde 400", tone: "error" })');
      return { id: oid, label: str(o, "label", op), ...(to ? { to } : {}), ...(o.toRow ? { toRow: o.toRow as string } : {}), ...(end ? { end } : {}) };
    });
    if (outcomes.length < 2) err(`${path}.outcomes`, "un rombo tiene al menos dos salidas");
    const cases = objs(v, "cases", path, false).map(({ v: c, path: cp }) => {
      const outcome = str(c, "outcome", cp);
      if (outcome && !outIds.has(outcome)) err(`${cp}.outcome`, `tiene que ser el id de una salida (${[...outIds].join(", ")})`);
      return { input: str(c, "input", cp), outcome, ...(c.before ? { before: str(c, "before", cp, false) } : {}), ...(c.warning ? { warning: str(c, "warning", cp, false) } : {}) };
    });
    const hunk = v.hunk === undefined ? undefined : hunkView(v.hunk, `${path}.hunk`);
    return {
      id,
      from,
      fromRow: v.fromRow as string,
      condition: str(v, "condition", path),
      status: oneOf(v, "status", DECISION_STATUS, path) as Decision["status"],
      summary: str(v, "summary", path),
      evidence: String(v.evidence ?? ""),
      outcomes,
      ...(cases.length ? { cases } : {}),
      ...(hunk ? { hunk } : {}),
    };
  });

  // Recorrido: todos los bloques, sin inventados
  const tour = list(d, "tour", "").filter((id, i) => {
    if (typeof id === "string" && stepIds.has(id)) return true;
    err(`tour[${i}]`, `no existe el bloque o rombo ${JSON.stringify(id)}`);
    return false;
  }) as string[];
  const missing = blocks.filter((b) => !tour.includes(b.id));
  if (missing.length) err("tour", `faltan estos bloques en el recorrido: ${missing.map((b) => b.id).join(", ")}`);

  await Promise.all(evidenceChecks);
  if (errors.length) return { errors };

  const draft = d as unknown as Draft;
  return {
    errors,
    analysis: {
      key: analysisKey(repo, diff),
      title: draft.title,
      context: draft.context,
      base: draft.baseLabel ?? diff.base.ref,
      head: draft.headLabel ?? diff.head.ref,
      repo,
      groups: draft.groups,
      blocks,
      edges,
      decisions,
      tour,
    },
  };
}

/** Un análisis por par de commits: si el MR suma un commit, es otro análisis */
export const analysisKey = (repo: string, diff: DiffResult) => `${repo.replace(/[^\w.-]+/g, "-")}-${diff.mergeBase.slice(0, 10)}-${diff.head.sha.slice(0, 10)}`;

