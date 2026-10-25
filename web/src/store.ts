import { create } from "zustand";
import type { Analysis, Block } from "../../src/shared/analysis";
import { mockAnalysis } from "./mock/conversion-montos";

export type Layer = "tests" | "minor";
/** Cómo cerró el revisor cada bloque. Navegar no marca nada */
export type Verdict = "ok" | "doubt";
type Show = Record<Layer | "index", boolean>;

/**
 * Estado de la revisión. Está separado de los componentes a propósito:
 * para el modo dos ventanas alcanza con sincronizar este store por BroadcastChannel.
 */
interface ReviewState {
  analysis: Analysis;
  selected: string | null;
  verdicts: Record<string, Verdict>;
  show: Show;
  /** Panel de código completo, pegado al de detalle */
  codeOpen: boolean;
  /** Contador que sube cada vez que hay que mover la cámara (aunque se repita el bloque) */
  flyTick: number;
  select: (id: string | null, fly?: boolean) => void;
  /** Elegir el mismo veredicto de nuevo lo saca */
  setVerdict: (id: string, v: Verdict) => void;
  toggleShow: (key: keyof Show) => void;
  setCodeOpen: (open: boolean) => void;
  tourStep: (dir: 1 | -1) => void;
}

const BASE_KEY = `trazo:${mockAnalysis.base}..${mockAnalysis.head}`;

function load<T>(key: string, fallback: T): T {
  try {
    return { ...fallback, ...JSON.parse(localStorage.getItem(key) ?? "{}") };
  } catch {
    return fallback;
  }
}

function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* sin storage, dura lo que la pestaña */
  }
}

/** A qué capa pertenece un bloque: las capas se pueden esconder, el resto siempre se ve */
export function layerOf(a: Analysis, b: Block): Layer | null {
  if (a.groups.find((g) => g.id === b.group)?.minor) return "minor";
  if (b.kind === "test") return "tests";
  return null;
}

/** El análisis recortado a lo que está prendido */
export function visibleAnalysis(a: Analysis, show: Show): Analysis {
  const blocks = a.blocks.filter((b) => {
    const layer = layerOf(a, b);
    return !layer || show[layer];
  });
  const ids = new Set(blocks.map((b) => b.id));
  return {
    ...a,
    blocks,
    groups: a.groups.filter((g) => blocks.some((b) => b.group === g.id)),
    edges: a.edges.filter((e) => ids.has(e.from) && ids.has(e.to)),
    tour: a.tour.filter((id) => ids.has(id)),
  };
}

export const useReview = create<ReviewState>((set, get) => ({
  analysis: mockAnalysis,
  selected: null,
  verdicts: load<Record<string, Verdict>>(`${BASE_KEY}:verdicts`, {}),
  show: load(`trazo:show`, { tests: false, minor: false, index: false }),
  codeOpen: false,
  flyTick: 0,
  setCodeOpen: (codeOpen) => set((s) => ({ codeOpen, flyTick: s.flyTick + 1 })),
  select: (id, fly = true) => {
    const { analysis, show } = get();
    // Si navegás a algo escondido, se prende su capa
    const block = id ? analysis.blocks.find((b) => b.id === id) : undefined;
    const layer = block ? layerOf(analysis, block) : null;
    if (layer && !show[layer]) get().toggleShow(layer);
    set((s) => ({ selected: id, codeOpen: id ? s.codeOpen : false, flyTick: fly ? s.flyTick + 1 : s.flyTick }));
  },
  setVerdict: (id, v) => {
    const verdicts = { ...get().verdicts };
    if (verdicts[id] === v) delete verdicts[id];
    else verdicts[id] = v;
    set({ verdicts });
    save(`${BASE_KEY}:verdicts`, verdicts);
  },
  toggleShow: (key) => {
    const show = { ...get().show, [key]: !get().show[key] };
    const { selected, analysis } = get();
    const sel = selected ? analysis.blocks.find((b) => b.id === selected) : undefined;
    const hidesSelected = sel && layerOf(analysis, sel) === key && !show[key];
    set({ show, ...(hidesSelected ? { selected: null } : {}) });
    save(`trazo:show`, show);
  },
  tourStep: (dir) => {
    const { analysis, show, selected } = get();
    const tour = visibleAnalysis(analysis, show).tour;
    const i = selected ? tour.indexOf(selected) : -1;
    const next = Math.min(tour.length - 1, Math.max(0, i + dir));
    get().select(tour[i === -1 ? 0 : next]);
  },
}));

/** Selector para los componentes: el análisis visible, memoizado por referencia */
let cache: { a: Analysis; show: Show; out: Analysis } | null = null;
export function useVisible(): Analysis {
  const { analysis, show } = useReview();
  if (!cache || cache.a !== analysis || cache.show !== show) cache = { a: analysis, show, out: visibleAnalysis(analysis, show) };
  return cache.out;
}

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
