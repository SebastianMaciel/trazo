import { Background, BackgroundVariant, MarkerType, PanOnScrollMode, ReactFlow, useReactFlow, type Edge, type Node } from "@xyflow/react";
import { useEffect, useMemo, useState } from "react";
import { useReview, visibleAnalysis } from "../store";
import { buildGraph, neighborsIn, wireActive } from "../graph";
import { FAR_ZOOM, layoutAnalysis, type Layout } from "../layout";
import { computeSteps } from "../steps";
import { useCssVar } from "../theme";
import { BlockNode, type BlockNodeData } from "./BlockNode";
import { DecisionNode, type DecisionNodeData } from "./DecisionNode";
import { EndNode, type EndNodeData } from "./EndNode";
import { FlowEdge, type FlowEdgeData } from "./FlowEdge";
import { GroupNode, type GroupNodeData } from "./GroupNode";
import { Overview } from "./Overview";
import { useFrame } from "./camera";

// "cluster" y no "group": React Flow le pone estilo propio (borde cuadrado) a los nodos tipo group
const nodeTypes = { block: BlockNode, cluster: GroupNode, decision: DecisionNode, end: EndNode };
const edgeTypes = { flow: FlowEdge };

export function Canvas() {
  const { selected, verdicts, flyTick, select, show } = useReview();
  const raw = useReview((s) => s.analysis);
  // El dibujo sale del análisis base: el orden del recorrido se deriva de él, no al revés
  const analysis = useMemo(() => visibleAnalysis(raw, show), [raw, show]);
  const [layout, setLayout] = useState<Layout | null>(null);
  const colorDel = useCssVar("--del");
  const colorAccent = useCssVar("--accent");
  const colorWire = useCssVar("--wire");
  const colorDot = useCssVar("--dot");
  const intent = useReview((s) => s.overview);

  useEffect(() => {
    let alive = true;
    layoutAnalysis(analysis).then((l) => alive && setLayout(l));
    return () => {
      alive = false;
    };
  }, [analysis]);

  const graph = useMemo(() => buildGraph(analysis), [analysis]);
  const focus = useMemo(() => neighborsIn(graph, selected), [graph, selected]);
  const steps = useMemo(() => computeSteps(analysis), [analysis]);
  const setTourOrder = useReview((s) => s.setTourOrder);
  useEffect(() => {
    if (steps && steps.order.join() !== useReview.getState().tourOrder.join()) setTourOrder(steps.order);
  }, [steps, setTourOrder]);
  // Por dónde seguir: el primer bloque del recorrido que todavía no cerraste
  const tour = steps.order;
  const next = tour.find((id) => !verdicts[id]);
  const resumed = !!next && next !== tour[0];

  const nodes = useMemo<Node[]>(() => {
    if (!layout) return [];
    const groups: Node<GroupNodeData>[] = analysis.groups.filter((g) => layout.groups[g.id]).map((g) => {
      const p = layout.groups[g.id];
      // Los rombos cuentan en el progreso del grupo del bloque del que salen
      const ids = graph.nodes.filter((n) => n.group === g.id && n.kind !== "end").map((n) => n.id);
      return {
        id: g.id,
        type: "cluster",
        position: { x: p.x, y: p.y },
        width: p.w,
        height: p.h,
        selectable: false,
        draggable: false,
        zIndex: 0,
        data: { group: g, n: analysis.groups.indexOf(g) + 1, done: ids.filter((id) => verdicts[id]).length, total: ids.length, dimmed: !!selected && !ids.some((id) => focus.has(id)) },
      };
    });
    const blocks: Node<BlockNodeData>[] = analysis.blocks.filter((b) => layout.nodes[b.id]).map((b) => {
      const p = layout.nodes[b.id];
      return {
        id: b.id,
        type: "block",
        parentId: b.group,
        position: { x: p.x, y: p.y },
        width: p.w,
        height: p.h,
        draggable: false,
        zIndex: 1,
        data: { block: b, step: steps.labels[b.id] ?? null, start: !selected && next === b.id ? (resumed ? "Seguí acá" : "Empezá acá") : null, selected: b.id === selected, dimmed: !!selected && !focus.has(b.id), verdict: verdicts[b.id] },
      };
    });
    const extras: Node[] = graph.nodes
      .filter((n) => n.kind !== "block" && layout.nodes[n.id])
      .map((n) => {
        const p = layout.nodes[n.id];
        const base = { id: n.id, parentId: n.group, position: { x: p.x, y: p.y }, width: p.w, height: p.h, draggable: false, zIndex: 1 };
        const dimmed = !!selected && !focus.has(n.id);
        if (n.kind === "decision") {
          const decision = analysis.decisions.find((d) => d.id === n.id)!;
          return { ...base, type: "decision", data: { decision, selected: selected === n.id, dimmed, step: steps.labels[n.id] ?? null, verdict: verdicts[n.id], start: !selected && next === n.id ? (resumed ? "Seguí acá" : "Empezá acá") : null } satisfies DecisionNodeData };
        }
        const w = graph.wires.find((x) => x.target === n.id)!;
        return { ...base, type: "end", selectable: false, data: { label: w.outcome!.end!.label, tone: w.outcome!.end!.tone, dimmed } satisfies EndNodeData };
      });
    return [...groups, ...blocks, ...extras];
  }, [layout, analysis, graph, selected, verdicts, focus, steps]);

  const edges = useMemo<Edge<FlowEdgeData>[]>(
    () =>
      graph.wires.map((w) => {
        const active = wireActive(graph, w, selected, focus);
        const color = w.outcome?.end?.tone === "error" ? colorDel : active ? colorAccent : colorWire;
        const marker = { type: MarkerType.ArrowClosed, width: 16, height: 16, color };
        return {
          id: w.id,
          type: "flow",
          source: w.reversed ? w.target : w.source,
          target: w.reversed ? w.source : w.target,
          sourceHandle: w.reversed ? w.targetHandle.replace(/:in$/, ":out") : w.sourceHandle,
          targetHandle: w.reversed ? w.sourceHandle.replace(/:out$/, ":in") : w.targetHandle,
          zIndex: active ? 3 : 2,
          // Las de test se rutean código → test: la punta va al principio del trazo, apuntando al código
          ...(w.reversed ? { markerStart: { ...marker, orient: "auto-start-reverse" } } : { markerEnd: marker }),
          data: { wire: w, active, dimmed: !!selected && !active, points: layout?.wires[w.id] },
        };
      }),
    [graph, selected, focus, layout, colorDel, colorAccent, colorWire],
  );

  // La cámara encuadra en el hueco libre entre los paneles flotantes, no en el centro de la pantalla
  const showIndex = useReview((s) => s.show.index);
  const codeOpen = useReview((s) => s.codeOpen);
  const frame = useFrame();
  const { getZoom } = useReactFlow();
  useEffect(() => {
    if (!layout) return;
    requestAnimationFrame(() => {
      if (!selected) return frame(graph.nodes.map((n) => n.id), { pad: 60, maxZoom: 0.9 });
      // Vecinos muy desparramados: mejor centrar solo el bloque a un zoom que se lea
      frame([...neighborsIn(graph, selected)], { pad: 80, maxZoom: 1, minZoom: { zoom: 0.95, focus: selected } });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flyTick, layout, showIndex, codeOpen]);

  return (
    <>
      <ReactFlow
        className={intent ? "is-intent" : ""}
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodeClick={(_, n) => {
          if (n.type !== "block" && n.type !== "decision") return;
          // De lejos el bloque solo muestra su título: tocarlo te acerca a ver qué tiene adentro
          if (getZoom() < FAR_ZOOM) return select(n.id);
          // La cámara se queda quieta salvo que lo que tocaste esté cortado o tapado por un panel
          const r = document.querySelector(`.react-flow__node[data-id="${CSS.escape(n.id)}"]`)!.getBoundingClientRect();
          const c = document.querySelector(".canvas")!.getBoundingClientRect();
          const left = c.left + ((document.querySelector(".detail") as HTMLElement | null)?.offsetWidth ?? 0) + 24;
          const right = c.right - (showIndex ? ((document.querySelector(".sidebar") as HTMLElement | null)?.offsetWidth ?? 0) + 24 : 0);
          const m = 72; // pegado al borde también cuenta como cortado: no se ve a dónde va
          const visible = r.left >= left + m && r.right <= right - m && r.top >= c.top + m && r.bottom <= c.bottom - m;
          select(n.id, !visible);
        }}
        onPaneClick={() => select(null, false)}
        nodesConnectable={false}
        // Como en Figma: dos dedos mueven el canvas, pellizcar hace zoom
        panOnScroll
        panOnScrollMode={PanOnScrollMode.Free}
        minZoom={0.08}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1.4} color={colorDot} />
      </ReactFlow>
      {intent && layout && <Overview analysis={analysis} graph={graph} next={next} />}
    </>
  );
}
