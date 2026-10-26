import { useReactFlow } from "@xyflow/react";
import { useCallback } from "react";
import { useReview } from "../store";

const width = (sel: string) => (document.querySelector(sel) as HTMLElement | null)?.offsetWidth ?? 0;

/** El hueco del canvas que no tapan los paneles flotantes */
export function freeArea() {
  const el = document.querySelector(".canvas") as HTMLElement;
  const code = width(".codepanel");
  const left = width(".detail") + (code ? code + 10 : 0) + 24;
  const right = useReview.getState().show.index ? width(".sidebar") + 24 : 0;
  return { x: left, y: 0, w: el.clientWidth - left - right, h: el.clientHeight, total: el.clientWidth };
}

export interface FrameOpts {
  pad: number;
  maxZoom: number;
  /** Si el encuadre queda más lejos que esto, centra solo en `focus` a ese zoom */
  minZoom?: { zoom: number; focus: string };
}

/** Encuadra unos nodos en el hueco libre, no en el centro de la pantalla */
export function useFrame() {
  const flow = useReactFlow();
  return useCallback(
    (ids: string[], { pad, maxZoom, minZoom }: FrameOpts) => {
      const rects = ids
        .map((id) => flow.getInternalNode(id))
        .filter((n) => !!n)
        .map((n) => ({ ...n.internals.positionAbsolute, w: n.measured.width ?? n.width ?? 320, h: n.measured.height ?? n.height ?? 120, id: n.id }));
      if (!rects.length) return;
      const view = freeArea();
      const box = {
        x: Math.min(...rects.map((r) => r.x)),
        y: Math.min(...rects.map((r) => r.y)),
        x2: Math.max(...rects.map((r) => r.x + r.w)),
        y2: Math.max(...rects.map((r) => r.y + r.h)),
      };
      let zoom = Math.min(view.w / (box.x2 - box.x + pad * 2), view.h / (box.y2 - box.y + pad * 2), maxZoom);
      let cx = (box.x + box.x2) / 2;
      let cy = (box.y + box.y2) / 2;
      const me = minZoom && rects.find((r) => r.id === minZoom.focus);
      if (minZoom && me && zoom < minZoom.zoom) {
        zoom = minZoom.zoom;
        cx = me.x + me.w / 2;
        cy = me.y + me.h / 2;
      }
      // setCenter centra en el canvas entero: corro el punto para que caiga en el centro del hueco libre
      const dx = (view.total / 2 - (view.x + view.w / 2)) / zoom;
      flow.setCenter(cx + dx, cy, { zoom, duration: 750 });
    },
    [flow],
  );
}
