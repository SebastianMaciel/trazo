import type { Analysis } from "../../../src/shared/analysis";
import { mockAnalysis } from "./conversion-montos";
import { cuponesAnalysis } from "./cupones-acumulados";

/** Los casos de demo, por rama. Se eligen con ?caso= en la URL y no necesitan server */
export const cases: Analysis[] = [mockAnalysis, cuponesAnalysis];

/** El análisis que trajo el server (?a=clave). Lo carga main antes de montar la app */
let loaded: Analysis | null = null;
export const setLoaded = (a: Analysis) => void (loaded = a);
export const isDemo = () => !loaded;

export function currentCase(): Analysis {
  if (loaded) return loaded;
  const head = new URLSearchParams(location.search).get("caso");
  return cases.find((c) => c.head === head) ?? cases[0];
}
