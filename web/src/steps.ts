import type { Analysis } from "../../src/shared/analysis";

export interface Steps {
  /** Número de cada paso: 1, 2, 3… corrido en todo el recorrido */
  labels: Record<string, string>;
  /** Orden del recorrido que coincide con los números */
  order: string[];
}

/** El recorrido de la AI con cada rombo justo después del bloque del que sale */
export function baseTour(a: Analysis): string[] {
  // Sin repetir: el recorrido que llega puede traer los rombos ya incluidos
  return [...new Set(a.tour.flatMap((id) => [id, ...a.decisions.filter((d) => d.from === id).map((d) => d.id)]))];
}

/**
 * Numeración: un solo número corrido, y el recorrido va grupo por grupo en el orden de los grupos.
 * Adentro de cada grupo, nivel = camino más largo desde un paso sin entradas, así nada aparece
 * antes de lo que le pasa datos; entre los del mismo nivel manda el orden de la AI.
 * Los pasos sin flujo (tests, textos) van al final de su grupo.
 */
export function computeSteps(a: Analysis): Steps {
  // Un rombo es un paso más: bloque → rombo → lo que sigue por cada salida
  const flow = [
    ...a.edges.filter((e) => e.kind !== "testea"),
    ...a.decisions.flatMap((d) => [{ from: d.from, to: d.id }, ...d.outcomes.filter((o) => o.to).map((o) => ({ from: d.id, to: o.to! }))]),
  ];
  const tour = baseTour(a);
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

  // Un rombo es del grupo del bloque del que sale
  const groupOf = (id: string) => a.blocks.find((b) => b.id === (a.decisions.find((d) => d.id === id)?.from ?? id))?.group;
  const groupRank = (id: string) => {
    const i = a.groups.findIndex((g) => g.id === groupOf(id));
    return i === -1 ? a.groups.length : i;
  };
  const key = (id: string) => [groupRank(id), inFlow.has(id) ? visit(id) : Infinity, tour.indexOf(id)];
  const order = [...tour].sort((p, q) => {
    const [x, y] = [key(p), key(q)];
    return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
  });
  const labels = Object.fromEntries(order.map((id, i) => [id, `${i + 1}`]));
  return { labels, order };
}
