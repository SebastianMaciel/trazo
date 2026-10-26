import { useSyncExternalStore } from "react";

/** Avisa cuando cambia el tema (data-theme o estilos inline en <html>) */
function subscribe(onChange: () => void) {
  const obs = new MutationObserver(onChange);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "style"] });
  return () => obs.disconnect();
}

/** Valor actual de una variable CSS del :root, re-evaluado cuando cambia el tema */
export function useCssVar(name: string): string {
  return useSyncExternalStore(subscribe, () => getComputedStyle(document.documentElement).getPropertyValue(name).trim());
}
