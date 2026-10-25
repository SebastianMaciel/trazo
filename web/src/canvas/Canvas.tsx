import { Background, BackgroundVariant, MarkerType, MiniMap, ReactFlow, useReactFlow, type Edge, type Node } from "@xyflow/react";
import { useEffect, useMemo, useState } from "react";
import { neighbors, useReview } from "../store";
import { layoutAnalysis, type Layout } from "../layout";
import { BlockNode, type BlockNodeData } from "./BlockNode";
import { FlowEdge, type FlowEdgeData } from "./FlowEdge";
import { GroupNode, type GroupNodeData } from "./GroupNode";

const nodeTypes = { block: BlockNode, group: GroupNode };
const edgeTypes = { flow: FlowEdge };

export function Canvas() {
  const { analysis, selected, checked, flyTick, select } = useReview();
  const [layout, setLayout] = useState<Layout | null>(null);
  const flow = useReactFlow();

  useEffect(() => {
    layoutAnalysis(analysis).then(setLayout);
  }, [analysis]);

  const focus = useMemo(() => neighbors(analysis, selected), [analysis, selected]);

  const nodes = useMemo<Node[]>(() => {
    if (!layout) return [];
    const groups: Node<GroupNodeData>[] = analysis.groups.map((g) => {
      const p = layout.groups[g.id];
      const ids = analysis.blocks.filter((b) => b.group === g.id).map((b) => b.id);
      return {
        id: g.id,
        type: "group",
        position: { x: p.x, y: p.y },
        width: p.w,
        height: p.h,
        selectable: false,
        draggable: false,
        zIndex: 0,
        data: { group: g, done: ids.filter((id) => checked[id]).length, total: ids.length, dimmed: !!selected && !ids.some((id) => focus.has(id)) },
      };
    });
    const blocks: Node<BlockNodeData>[] = analysis.blocks.map((b) => {
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
        data: { block: b, step: analysis.tour.indexOf(b.id) + 1, selected: b.id === selected, dimmed: !!selected && !focus.has(b.id), checked: !!checked[b.id] },
      };
    });
    return [...groups, ...blocks];
  }, [layout, analysis, selected, checked, focus]);

  const edges = useMemo<Edge<FlowEdgeData>[]>(
    () =>
      analysis.edges.map((e) => {
        const active = !!selected && (e.from === selected || e.to === selected);
        return {
          id: e.id,
          type: "flow",
          source: e.from,
          target: e.to,
          sourceHandle: e.fromRow ? `${e.fromRow}:out` : "card:out",
          targetHandle: e.toRow ? `${e.toRow}:in` : "card:in",
          zIndex: active ? 3 : 2,
          markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: active ? "#f5b942" : "#5d6f9e" },
          data: { edge: e, active, dimmed: !!selected && !active },
        };
      }),
    [analysis, selected],
  );

  // La cámara viaja al bloque y lo deja a un zoom donde se lee
  useEffect(() => {
    if (!layout) return;
    if (!selected) {
      requestAnimationFrame(() => flow.fitView({ duration: 700, padding: 0.08 }));
      return;
    }
    // Si el bloque y sus vecinos entran a un zoom legible, los encuadra a todos. Si no, centra el bloque.
    const rects = [...neighbors(analysis, selected)]
      .map((id) => flow.getInternalNode(id))
      .filter((n) => !!n)
      .map((n) => ({ ...n.internals.positionAbsolute, w: n.measured.width ?? 320, h: n.measured.height ?? 120, id: n.id }));
    const minX = Math.min(...rects.map((r) => r.x));
    const minY = Math.min(...rects.map((r) => r.y));
    const maxX = Math.max(...rects.map((r) => r.x + r.w));
    const maxY = Math.max(...rects.map((r) => r.y + r.h));
    const el = document.querySelector(".canvas")!;
    const fitZoom = Math.min(el.clientWidth / (maxX - minX + 160), el.clientHeight / (maxY - minY + 160));
    if (fitZoom >= 0.7) {
      flow.fitView({ nodes: rects.map(({ id }) => ({ id })), duration: 750, padding: 0.15, maxZoom: 1 });
    } else {
      const me = rects.find((r) => r.id === selected)!;
      flow.setCenter(me.x + me.w / 2, me.y + me.h / 2, { zoom: 0.9, duration: 750 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flyTick, layout]);

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
      fitView
    >
      <Background variant={BackgroundVariant.Dots} gap={24} size={1.4} color="#24345e" />
      <MiniMap
        pannable
        zoomable
        nodeColor={(n) => (n.type === "group" ? "rgba(140,160,210,0.12)" : n.id === selected ? "#f5b942" : checked[n.id] ? "#4ade80" : "#6a7bb0")}
        nodeStrokeWidth={0}
        maskColor="rgba(6,10,22,0.7)"
        className="minimap"
      />
    </ReactFlow>
  );
}
