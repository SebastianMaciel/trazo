import { ReactFlowProvider } from "@xyflow/react";
import { useEffect } from "react";
import { Canvas } from "./canvas/Canvas";
import { CodePanel } from "./panels/CodePanel";
import { DetailPanel } from "./panels/DetailPanel";
import { Sidebar } from "./panels/Sidebar";
import { TopBar } from "./panels/TopBar";
import { useReview } from "./store";

export function App() {
  const { tourStep, select, show, codeOpen, setCodeOpen } = useReview();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === "ArrowRight") tourStep(1);
      if (e.key === "ArrowLeft") tourStep(-1);
      if (e.key === "Escape") {
        if (useReview.getState().codeOpen) setCodeOpen(false);
        else select(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tourStep, select, setCodeOpen]);

  return (
    <ReactFlowProvider>
      <div className="app">
        <TopBar />
        {/* El canvas ocupa todo; los paneles flotan arriba */}
        <div className={`workspace ${show.index ? "with-index" : ""}`}>
          <main className="canvas">
            <Canvas />
          </main>
          {show.index && <Sidebar />}
          <DetailPanel />
          {codeOpen && <CodePanel />}
        </div>
      </div>
    </ReactFlowProvider>
  );
}
