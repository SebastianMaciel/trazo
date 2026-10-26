import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { Analysis } from "../../../src/shared/analysis";
import type { Graph } from "../graph";
import { groupLinks, overviewCols } from "../overview";
import { stepOf } from "../review";
import { useReview } from "../store";
import { freeArea, useFrame } from "./camera";

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

type Side = "top" | "bottom" | "left" | "right";

/** Altura del título: las flechas de costado salen de ahí, así quedan rectas aunque las cards midan distinto */
const HEAD_Y = 32;

/** Dónde se engancha una flecha en un lado, corrida `off` a lo largo del lado */
function anchor(r: Rect, side: Side, off: number) {
  if (side === "left") return { x: r.x, y: r.y + HEAD_Y + off };
  if (side === "right") return { x: r.x + r.w, y: r.y + HEAD_Y + off };
  if (side === "top") return { x: r.x + r.w / 2 + off, y: r.y };
  return { x: r.x + r.w / 2 + off, y: r.y + r.h };
}

/** Por qué lados sale y entra la flecha, según dónde queda una card respecto de la otra */
function sides(a: Rect, b: Rect): [Side, Side] {
  const sameRow = Math.abs(a.y - b.y) < a.h / 2;
  if (sameRow) return b.x > a.x ? ["right", "left"] : ["left", "right"];
  return b.y > a.y ? ["bottom", "top"] : ["top", "bottom"];
}

/** El resto del pellizco que te sacó del esquema no sigue moviendo el mapa: termina cuando soltás */
function swallowGesture() {
  let timer = 0;
  const stop = (e: WheelEvent) => {
    e.preventDefault();
    e.stopPropagation();
    clearTimeout(timer);
    timer = window.setTimeout(() => window.removeEventListener("wheel", stop, true), 250);
  };
  window.addEventListener("wheel", stop, { capture: true, passive: false });
  timer = window.setTimeout(() => window.removeEventListener("wheel", stop, true), 250);
}

/**
 * El esquema: una card por grupo, en el orden del recorrido, y flechas entre los grupos que se pasan datos.
 * Es lo primero que ves y se vuelve con "Vista general". Tocar una card acerca la cámara a ese grupo
 */
export function Overview({ analysis: a, graph, next }: { analysis: Analysis; graph: Graph; next?: string }) {
  const { verdicts, select, setOverview } = useReview();
  const frame = useFrame();
  const links = useMemo(() => groupLinks(graph), [graph]);
  const box = useRef<HTMLDivElement>(null);
  const cards = useRef<Record<string, HTMLDivElement | null>>({});
  const [rects, setRects] = useState<Record<string, Rect>>({});
  const [area, setArea] = useState(() => freeArea());

  useLayoutEffect(() => {
    const measure = () => {
      setArea(freeArea());
      const base = box.current?.getBoundingClientRect();
      if (!base) return;
      const out: Record<string, Rect> = {};
      for (const [id, el] of Object.entries(cards.current)) {
        const r = el?.getBoundingClientRect();
        if (r) out[id] = { x: r.left - base.left, y: r.top - base.top, w: r.width, h: r.height };
      }
      setRects(out);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(document.querySelector(".canvas")!);
    if (box.current) ro.observe(box.current);
    return () => ro.disconnect();
  }, [a, links]);

  /** Entrar a un grupo. Si entero no entra a un zoom que se lea, te deja donde seguir adentro del grupo */
  const enter = (groupId: string) => {
    const ids = graph.nodes.filter((n) => n.group === groupId && n.kind !== "end").map((n) => n.id);
    const inGroup = useReview.getState().tourOrder.filter((id) => ids.includes(id));
    const focus = inGroup.find((id) => !verdicts[id]) ?? inGroup[0] ?? ids[0];
    setOverview(false);
    // Un cuadro después: el cambio de vista también mueve la cámara (al mapa entero) y este encuadre tiene que ganar
    requestAnimationFrame(() => requestAnimationFrame(() => frame([groupId], { pad: 60, maxZoom: 0.9, minZoom: { zoom: 0.5, focus, lead: true } })));
  };
  const enterRef = useRef(enter);
  enterRef.current = enter;
  const setOverviewRef = useRef(setOverview);
  setOverviewRef.current = setOverview;
  const rectsRef = useRef(rects);
  rectsRef.current = rects;

  // El esquema no tiene la geometría del mapa: pellizcar para acercarte entra al grupo más cercano al dedo,
  // y para alejarte muestra el mapa entero. Una sola vez por gesto
  const root = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    let quietUntil = 0;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return; // dos dedos sin pellizcar: scroll normal del esquema
      e.preventDefault();
      const now = performance.now();
      const busy = now < quietUntil;
      quietUntil = now + 400;
      if (busy || e.deltaY === 0) return;
      if (e.deltaY > 0) {
        swallowGesture();
        return setOverviewRef.current(false);
      }
      const base = box.current!.getBoundingClientRect();
      const px = e.clientX - base.left;
      const py = e.clientY - base.top;
      const dist = (r: Rect) => Math.hypot(Math.max(r.x - px, 0, px - r.x - r.w), Math.max(r.y - py, 0, py - r.y - r.h));
      const near = Object.entries(rectsRef.current).sort(([, p], [, q]) => dist(p) - dist(q))[0];
      if (!near) return;
      swallowGesture();
      enterRef.current(near[0]);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // Cuántas flechas usan cada lado de cada card, para no encimarlas
  const arrows = useMemo(() => {
    const uses = new Map<string, number>();
    const planned = links
      .filter((l) => rects[l.from] && rects[l.to])
      .map((l) => {
        const [s, t] = sides(rects[l.from], rects[l.to]);
        const ks = `${l.from}:${s}`;
        const kt = `${l.to}:${t}`;
        const is = uses.get(ks) ?? 0;
        const it = uses.get(kt) ?? 0;
        uses.set(ks, is + 1);
        uses.set(kt, it + 1);
        return { l, s, t, is, it, ks, kt };
      });
    const spread = (k: string, i: number) => (i - ((uses.get(k) ?? 1) - 1) / 2) * 14;
    return planned.map(({ l, s, t, is, it, ks, kt }) => {
      const p = anchor(rects[l.from], s, spread(ks, is));
      const q = anchor(rects[l.to], t, spread(kt, it));
      const horiz = s === "left" || s === "right";
      // Si salta una card del medio, la curva pasa por arriba (o por el costado) en vez de cruzarla
      const far = horiz ? Math.abs(q.x - p.x) > rects[l.from].w * 1.6 : Math.abs(q.y - p.y) > rects[l.from].h * 1.6;
      const bow = far ? 70 : 0;
      const d = horiz
        ? `M${p.x},${p.y} C${(p.x + q.x) / 2},${p.y - bow} ${(p.x + q.x) / 2},${q.y - bow} ${q.x},${q.y}`
        : `M${p.x},${p.y} C${p.x - bow},${(p.y + q.y) / 2} ${q.x - bow},${(p.y + q.y) / 2} ${q.x},${q.y}`;
      return { id: `${l.from}>${l.to}`, d, count: l.count };
    });
  }, [links, rects]);

  const groupOfStep = (id: string) => graph.nodes.find((n) => n.id === id)?.group;
  const cols = overviewCols(a.groups.length);
  const style = { left: area.x, width: area.w, "--cols": cols } as CSSProperties;

  return (
    <div className="ov" style={style} ref={root}>
      <div className="ov-grid" ref={box}>
        <svg className="ov-arrows" aria-hidden>
          <defs>
            <marker id="ov-head" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" />
            </marker>
          </defs>
          {arrows.map((ar) => (
            <path key={ar.id} d={ar.d} markerEnd="url(#ov-head)" />
          ))}
        </svg>
        {a.groups.map((g, i) => {
          const ids = graph.nodes.filter((n) => n.group === g.id && n.kind !== "end").map((n) => n.id);
          const done = ids.filter((id) => verdicts[id]).length;
          const warned = ids.map((id) => stepOf(a, id)).filter((s) => s.warnings.length);
          const here = next && groupOfStep(next) === g.id;
          return (
            <div
              key={g.id}
              ref={(el) => {
                cards.current[g.id] = el;
              }}
              className={`ov-card ${done === ids.length ? "is-done" : ""} ${g.minor ? "is-minor" : ""}`}
              onClick={() => enter(g.id)}
            >
              <div className="ov-head">
                <span className="group-n">{i + 1}</span>
                <span className="ov-title">{g.title}</span>
              </div>
              <p className="ov-summary">{g.summary}</p>
              <p className="ov-meta">
                {done} de {ids.length} revisados
                {here && <span className="ov-here">{done ? "Seguí acá" : "Empezá acá"}</span>}
              </p>
              {warned.length > 0 && (
                <ul className="ov-warns">
                  {warned.map((s) => (
                    <li key={s.id}>
                      <button
                        className="ov-warn"
                        onClick={(e) => {
                          e.stopPropagation();
                          select(s.id);
                        }}
                      >
                        <span className="warn-dot">!</span>
                        <span>{s.title}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
