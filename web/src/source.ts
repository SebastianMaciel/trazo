import type { Analysis } from "../../src/shared/analysis";

/** El análisis que trajo el server. Lo carga main antes de montar la app: el store lo lee al crearse */
let loaded: Analysis | null = null;

export const setLoaded = (a: Analysis) => void (loaded = a);

export function currentAnalysis(): Analysis {
  if (!loaded) throw new Error("Todavía no se cargó ningún análisis");
  return loaded;
}
