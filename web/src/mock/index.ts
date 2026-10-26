import type { Analysis } from "../../../src/shared/analysis";
import { mockAnalysis } from "./conversion-montos";
import { cuponesAnalysis } from "./cupones-acumulados";

/** Los casos de prueba, por rama. Se elige con ?caso= en la URL */
export const cases: Analysis[] = [mockAnalysis, cuponesAnalysis];

export function currentCase(): Analysis {
  const head = new URLSearchParams(location.search).get("caso");
  return cases.find((c) => c.head === head) ?? cases[0];
}
