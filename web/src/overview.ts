import type { Graph } from "./graph";

export interface GroupLink {
  from: string;
  to: string;
  /** Cuántos cables cruzan de un grupo al otro */
  count: number;
}

/** Qué grupo le pasa datos a cuál, sumando los cables que cruzan. Los de test no cuentan: no son flujo */
export function groupLinks(g: Graph): GroupLink[] {
  const groupOf = new Map(g.nodes.map((n) => [n.id, n.group]));
  const links = new Map<string, GroupLink>();
  for (const w of g.wires) {
    if (w.kind === "testea") continue;
    const from = groupOf.get(w.source);
    const to = groupOf.get(w.target);
    if (!from || !to || from === to) continue;
    const key = `${from}>${to}`;
    const l = links.get(key) ?? { from, to, count: 0 };
    l.count++;
    links.set(key, l);
  }
  return [...links.values()];
}

/** Columnas del esquema: que entre en pantalla sin quedar una tira larga */
export const overviewCols = (n: number) => (n <= 3 ? n : n === 4 ? 2 : 3);
