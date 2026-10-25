import { Background, BackgroundVariant, MarkerType, MiniMap, ReactFlow, useReactFlow, type Edge, type Node } from "@xyflow/react";
import { useEffect, useMemo, useState } from "react";
import { neighbors, useReview, useVisible } from "../store";
import { layoutAnalysis, type Layout } from "../layout";
import { BlockNode, type BlockNodeData } from "./BlockNode";
import { FlowEdge, type FlowEdgeData } from "./FlowEdge";
import { GroupNode, type GroupNodeData } from "./GroupNode";

// "cluster" y no "group": React Flow le pone estilo propio (borde cuadrado) a los nodos tipo group
const nodeTypes = { block: BlockNode, cluster: GroupNode };
const edgeTypes = { flow: FlowEdge };

export function Canvas() {
  const { selected, verdicts, flyTick, select } = useReview();
  const analysis = useVisible();
  const [layout, setLayout] = useState<Layout | null>(null);
  const flow = useReactFlow();

  useEffect(() => {
    let alive = true;
    layoutAnalysis(analysis).then((l) => alive && setLayout(l));
    return () => {
      alive = false;
    };
  }, [analysis]);

  const focus = useMemo(() => neighbors(analysis, selected), [analysis, selected]);
  // Por dónde seguir: el primer bloque del recorrido que todavía no cerraste
  const next = analysis.tour.find((id) => !verdicts[id]);
  const resumed = next !== analysis.tour[0];

  const nodes = useMemo<Node[]>(() => {
    if (!layout) return [];
    const groups: Node<GroupNodeData>[] = analysis.groups.filter((g) => layout.groups[g.id]).map((g) => {
      const p = layout.groups[g.id];
      const ids = analysis.blocks.filter((b) => b.group === g.id).map((b) => b.id);
      return {
        id: g.id,
        type: "cluster",
        position: { x: p.x, y: p.y },
        width: p.w,
        height: p.h,
        selectable: false,
        draggable: false,
        zIndex: 0,
        data: { group: g, done: ids.filter((id) => verdicts[id] === "ok").length, total: ids.length, dimmed: !!selected && !ids.some((id) => focus.has(id)) },
      };
    });
    const blocks: Node<BlockNodeData>[] = analysis.blocks.filter((b) => layout.blocks[b.id]).map((b) => {
      const p = layout.blocks[b.id];
      return {
        id: b.id,
        type: "block",
        parentId: b.group,
        position: { x: p.x, y: p.y },
        width: p.w,
        height: p.h,
        draggable: false,
        zIndex: 1,
        data: { block: b, step: analysis.tour.indexOf(b.id) + 1, start: !selected && next === b.id ? (resumed ? "Seguí acá" : "Empezá acá") : null, selected: b.id === selected, dimmed: !!selected && !focus.has(b.id), verdict: verdicts[b.id] },
      };
    });
    return [...groups, ...blocks];
  }, [layout, analysis, selected, verdicts, focus]);

  const edges = useMemo<Edge<FlowEdgeData>[]>(
    () =>
      analysis.edges.map((e) => {
        const active = !!selected && (e.from === selected || e.to === selected);
        const marker = { type: MarkerType.ArrowClosed, width: 16, height: 16, color: active ? "#f5b942" : "#6c7fb3" };
        return {
          id: e.id,
          type: "flow",
          source: e.from,
          target: e.to,
          sourceHandle: e.fromRow ? `${e.fromRow}:out` : "card:out",
          targetHandle: e.toRow ? `${e.toRow}:in` : "card:in",
          zIndex: active ? 3 : 2,
          // Las de test se rutean código → test: la punta va al principio del trazo, apuntando al código
          ...(e.kind === "testea" ? { markerStart: { ...marker, orient: "auto-start-reverse" } } : { markerEnd: marker }),
          data: { edge: e, active, dimmed: !!selected && !active, points: layout?.edges[e.id] },
        };
      }),
    [analysis, selected, layout],
  );

  // La cámara encuadra en el hueco libre entre los paneles flotantes, no en el centro de la pantalla
  const showIndex = useReview((s) => s.show.index);
  const codeOpen = useReview((s) => s.codeOpen);
  useEffect(() => {
    if (!layout) return;
    requestAnimationFrame(() => {
      const ids = selected ? [...neighbors(analysis, selected)] : analysis.blocks.map((b) => b.id);
      const rects = ids
        .map((id) => flow.getInternalNode(id))
        .filter((n) => !!n)
        .map((n) => ({ ...n.internals.positionAbsolute, w: n.measured.width ?? 320, h: n.measured.height ?? 120, id: n.id }));
      if (!rects.length) return;
      const el = document.querySelector(".canvas")!;
      const panel = (sel: string) => (document.querySelector(sel) as HTMLElement | null)?.offsetWidth ?? 0;
      const code = panel(".codepanel");
      const left = panel(".detail") + (code ? code + 10 : 0) + 24;
      const right = showIndex ? panel(".sidebar") + 24 : 0;
      const view = { x: left, y: 0, w: el.clientWidth - left - right, h: el.clientHeight };
      const pad = selected ? 80 : 120;

      const box = {
        x: Math.min(...rects.map((r) => r.x)),
        y: Math.min(...rects.map((r) => r.y)),
        x2: Math.max(...rects.map((r) => r.x + r.w)),
        y2: Math.max(...rects.map((r) => r.y + r.h)),
      };
      let zoom = Math.min(view.w / (box.x2 - box.x + pad * 2), view.h / (box.y2 - box.y + pad * 2), selected ? 1 : 0.9);
      let cx = (box.x + box.x2) / 2;
      let cy = (box.y + box.y2) / 2;
      // Vecinos muy desparramados: mejor centrar solo el bloque a un zoom que se lea
      if (selected && zoom < 0.85) {
        const me = rects.find((r) => r.id === selected)!;
        zoom = 0.95;
        cx = me.x + me.w / 2;
        cy = me.y + me.h / 2;
      }
      // setCenter centra en el canvas entero: corro el punto para que caiga en el centro del hueco libre
      const dx = (el.clientWidth / 2 - (view.x + view.w / 2)) / zoom;
      flow.setCenter(cx + dx, cy, { zoom, duration: 750 });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flyTick, layout, showIndex, codeOpen]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodeClick={(_, n) => n.type === "block" && select(n.id, false)}
      onPaneClick={() => select(null, false)}
      nodesConnectable={false}
      minZoom={0.08}
      maxZoom={2}
      proOptions={{ hideAttribution: true }}
    >
      <Background variant={BackgroundVariant.Dots} gap={24} size={1.4} color="#24345e" />
      <MiniMap
        pannable
        zoomable
        nodeColor={(n) => (n.type === "cluster" ? "rgba(140,160,210,0.12)" : n.id === selected ? "#f5b942" : verdicts[n.id] === "ok" ? "#4ade80" : verdicts[n.id] === "doubt" ? "#f5b942" : "#6a7bb0")}
        nodeStrokeWidth={0}
        maskColor="rgba(6,10,22,0.7)"
        className="minimap"
      />
    </ReactFlow>
  );
}
