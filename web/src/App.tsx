import { ReactFlowProvider } from "@xyflow/react";
import { useEffect } from "react";
import { Canvas } from "./canvas/Canvas";
import { DetailPanel } from "./panels/DetailPanel";
import { Sidebar } from "./panels/Sidebar";
import { TopBar } from "./panels/TopBar";
import { useReview } from "./store";

export function App() {
  const { tourStep, select } = useReview();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === "ArrowRight") tourStep(1);
      if (e.key === "ArrowLeft") tourStep(-1);
      if (e.key === "Escape") select(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tourStep, select]);

  return (
    <ReactFlowProvider>
      <div className="app">
        <TopBar />
        <div className="workspace">
          <Sidebar />
          <main className="canvas">
            <Canvas />
          </main>
          <DetailPanel />
        </div>
      </div>
    </ReactFlowProvider>
  );
}
