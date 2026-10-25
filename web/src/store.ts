import { create } from "zustand";
import type { Analysis } from "../../src/shared/analysis";
import { mockAnalysis } from "./mock/conversion-montos";

/**
 * Estado de la revisión. Está separado de los componentes a propósito:
 * para el modo dos ventanas alcanza con sincronizar este store por BroadcastChannel.
 */
interface ReviewState {
  analysis: Analysis;
  selected: string | null;
  checked: Record<string, boolean>;
  /** Contador que sube cada vez que hay que mover la cámara (aunque se repita el bloque) */
  flyTick: number;
  select: (id: string | null, fly?: boolean) => void;
  toggleCheck: (id: string) => void;
  tourStep: (dir: 1 | -1) => void;
}

const KEY = `trazo:checked:${mockAnalysis.base}..${mockAnalysis.head}`;

function loadChecked(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}");
  } catch {
    return {};
  }
}

export const useReview = create<ReviewState>((set, get) => ({
  analysis: mockAnalysis,
  selected: null,
  checked: loadChecked(),
  flyTick: 0,
  select: (id, fly = true) => set((s) => ({ selected: id, flyTick: fly ? s.flyTick + 1 : s.flyTick })),
  toggleCheck: (id) => {
    const checked = { ...get().checked, [id]: !get().checked[id] };
    set({ checked });
    try {
      localStorage.setItem(KEY, JSON.stringify(checked));
    } catch {
      /* sin storage, los tildes duran lo que la pestaña */
    }
  },
  tourStep: (dir) => {
    const { analysis, selected } = get();
    const i = selected ? analysis.tour.indexOf(selected) : -1;
    const next = Math.min(analysis.tour.length - 1, Math.max(0, i + dir));
    get().select(analysis.tour[i === -1 ? 0 : next]);
  },
}));

export function neighbors(analysis: Analysis, id: string | null): Set<string> {
  const out = new Set<string>();
  if (!id) return out;
  out.add(id);
  for (const e of analysis.edges) {
    if (e.from === id) out.add(e.to);
    if (e.to === id) out.add(e.from);
  }
  return out;
}
