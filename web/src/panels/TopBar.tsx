import { layerOf, useReview, useVisible, type Layer } from "../store";

export function TopBar() {
  const { analysis, selected, checked, show, tourStep, select, toggleShow } = useReview();
  const visible = useVisible();
  const i = selected ? visible.tour.indexOf(selected) : -1;
  const done = visible.blocks.filter((b) => checked[b.id]).length;
  const count = (layer: Layer) => analysis.blocks.filter((b) => layerOf(analysis, b) === layer).length;

  return (
    <header className="topbar">
      <button className={`btn btn-ghost ${show.index ? "is-on" : ""}`} onClick={() => toggleShow("index")}>
        ☰ Índice
      </button>
      <span className="logo">trazo</span>
      <span className="pr-title">{analysis.title}</span>
      <span className="branches">
        <span className="pill">{analysis.base}</span>
        <span className="arrow">←</span>
        <span className="pill pill-head">{analysis.head}</span>
      </span>

      <div className="layers">
        <span className="layers-label">Mostrar</span>
        {(["tests", "minor"] as const).map((l) => (
          <button key={l} className={`toggle ${show[l] ? "is-on" : ""}`} onClick={() => toggleShow(l)} aria-pressed={show[l]}>
            <span className="toggle-box">{show[l] ? "✓" : ""}</span>
            {l === "tests" ? "Tests" : "Menores"}
            <span className="toggle-count">{count(l)}</span>
          </button>
        ))}
      </div>

      <div className="topbar-progress" title={`${done} de ${visible.blocks.length} entendidos`}>
        <span>
          <strong>{done}</strong>/{visible.blocks.length}
        </span>
        <div className="progress-bar">
          <div style={{ width: `${(done / Math.max(1, visible.blocks.length)) * 100}%` }} />
        </div>
      </div>

      <div className="tour">
        <button className="btn" onClick={() => select(null)}>
          Vista general
        </button>
        <button className="btn btn-icon" onClick={() => tourStep(-1)} disabled={i <= 0} aria-label="Anterior">
          ←
        </button>
        <span className="tour-pos">{i === -1 ? "Recorrido" : `${i + 1} / ${visible.tour.length}`}</span>
        <button className="btn btn-icon btn-primary" onClick={() => tourStep(1)} disabled={i === visible.tour.length - 1} aria-label="Siguiente">
          →
        </button>
      </div>
    </header>
  );
}
