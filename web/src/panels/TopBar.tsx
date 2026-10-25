import { useReview } from "../store";

export function TopBar() {
  const { analysis, selected, tourStep, select } = useReview();
  const i = selected ? analysis.tour.indexOf(selected) : -1;

  return (
    <header className="topbar">
      <span className="logo">trazo</span>
      <span className="pr-title">{analysis.title}</span>
      <span className="branches">
        <span className="pill">{analysis.base}</span>
        <span className="arrow">←</span>
        <span className="pill pill-head">{analysis.head}</span>
      </span>

      <div className="tour">
        <button className="btn" onClick={() => select(null)}>
          Vista general
        </button>
        <button className="btn btn-icon" onClick={() => tourStep(-1)} disabled={i <= 0} aria-label="Anterior">
          ←
        </button>
        <span className="tour-pos">{i === -1 ? "Recorrido" : `${i + 1} / ${analysis.tour.length}`}</span>
        <button className="btn btn-icon btn-primary" onClick={() => tourStep(1)} disabled={i === analysis.tour.length - 1} aria-label="Siguiente">
          →
        </button>
      </div>
    </header>
  );
}
