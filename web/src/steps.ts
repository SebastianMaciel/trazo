import type { Analysis } from "../../src/shared/analysis";
import type { Layout } from "./layout";

export interface Steps {
  /** Número de cada bloque: 1, 2, 3, 4, 5a, 5b… */
  labels: Record<string, string>;
  /** Orden del recorrido que coincide con los números */
  order: string[];
}

/**
 * Numeración según el flujo, no según el orden en que la AI listó los bloques.
 * Nivel = camino más largo desde un bloque sin entradas. Los del mismo nivel van en
 * paralelo: llevan letra y se ordenan de arriba hacia abajo como quedaron dibujados,
 * así el número, la posición en el mapa y el recorrido dicen lo mismo.
 * Los bloques sin flujo (tests, textos) van al final en el orden original.
 */
export function computeSteps(a: Analysis, layout: Layout): Steps {
  const flow = a.edges.filter((e) => e.kind !== "testea");
  const inFlow = new Set(flow.flatMap((e) => [e.from, e.to]));
  const level: Record<string, number> = {};

  const visit = (id: string, path = new Set<string>()): number => {
    if (level[id] !== undefined) return level[id];
    if (path.has(id)) return 1; // ciclo: cortamos acá
    path.add(id);
    const preds = flow.filter((e) => e.to === id).map((e) => e.from);
    level[id] = preds.length ? 1 + Math.max(...preds.map((p) => visit(p, path))) : 1;
    path.delete(id);
    return level[id];
  };

  const y = (id: string) => {
    const b = a.blocks.find((x) => x.id === id);
    return (b ? (layout.groups[b.group]?.y ?? 0) : 0) + (layout.blocks[id]?.y ?? 0);
  };

  const byLevel = new Map<number, string[]>();
  for (const id of a.tour.filter((id) => inFlow.has(id))) {
    const l = visit(id);
    byLevel.set(l, [...(byLevel.get(l) ?? []), id]);
  }

  const labels: Record<string, string> = {};
  const order: string[] = [];
  let n = 0;
  for (const l of [...byLevel.keys()].sort((p, q) => p - q)) {
    n = l;
    const ids = byLevel.get(l)!.sort((p, q) => y(p) - y(q));
    ids.forEach((id, i) => {
      labels[id] = ids.length > 1 ? `${l}${String.fromCharCode(97 + i)}` : `${l}`;
      order.push(id);
    });
  }
  for (const id of a.tour.filter((id) => !inFlow.has(id))) {
    labels[id] = `${++n}`;
    order.push(id);
  }
  return { labels, order };
}
