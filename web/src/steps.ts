import type { Analysis } from "../../src/shared/analysis";

export interface Steps {
  /** Número de cada bloque: 1, 2, 3, 4, 5a, 5b… */
  labels: Record<string, string>;
  /** Orden del recorrido que coincide con los números */
  order: string[];
}

/**
 * Numeración: el flujo pone la regla dura y la AI decide el resto.
 * Nivel = camino más largo desde un bloque sin entradas, así nada aparece antes de lo
 * que le pasa datos. Los del mismo nivel van en paralelo y llevan letra; entre ellos
 * manda el orden del recorrido de la AI (por ejemplo, lo más riesgoso primero).
 * Los bloques sin flujo (tests, textos) van al final en el orden de la AI.
 */
/** El recorrido de la AI con cada rombo justo después del bloque del que sale */
export function baseTour(a: Analysis): string[] {
  // Sin repetir: el recorrido que llega puede traer los rombos ya incluidos
  return [...new Set(a.tour.flatMap((id) => [id, ...a.decisions.filter((d) => d.from === id).map((d) => d.id)]))];
}

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

  const byLevel = new Map<number, string[]>();
  for (const id of tour.filter((id) => inFlow.has(id))) {
    const l = visit(id);
    byLevel.set(l, [...(byLevel.get(l) ?? []), id]);
  }

  const labels: Record<string, string> = {};
  const order: string[] = [];
  let n = 0;
  for (const l of [...byLevel.keys()].sort((p, q) => p - q)) {
    n = l;
    const ids = byLevel.get(l)!; // ya vienen en el orden de la AI
    ids.forEach((id, i) => {
      labels[id] = ids.length > 1 ? `${l}${String.fromCharCode(97 + i)}` : `${l}`;
      order.push(id);
    });
  }
  for (const id of tour.filter((id) => !inFlow.has(id))) {
    labels[id] = `${++n}`;
    order.push(id);
  }
  return { labels, order };
}
