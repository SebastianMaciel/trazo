import { layerOf, useReview, useVisible, type Layer } from "../store";

export function TopBar() {
  const { analysis, selected, verdicts, show, select, toggleShow } = useReview();
  const visible = useVisible();
  const ok = visible.blocks.filter((b) => verdicts[b.id] === "ok").length;
  const doubts = visible.blocks.filter((b) => verdicts[b.id] === "doubt").length;
  const total = Math.max(1, visible.blocks.length);
  const count = (layer: Layer) => analysis.blocks.filter((b) => layerOf(analysis, b) === layer).length;

  return (
    <header className="topbar">
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

      <div className="topbar-progress">
        <span>
          <strong>{ok}</strong> de {visible.blocks.length} entendidos
          {doubts > 0 && <span className="doubts"> · {doubts} con dudas</span>}
        </span>
        <div className="progress-bar">
          <div className="pb-ok" style={{ width: `${(ok / total) * 100}%` }} />
          <div className="pb-doubt" style={{ width: `${(doubts / total) * 100}%` }} />
        </div>
      </div>

      <button className="btn" onClick={() => select(null)} disabled={!selected}>
        Vista general
      </button>
      <button className={`btn btn-ghost ${show.index ? "is-on" : ""}`} onClick={() => toggleShow("index")}>
        ☰ Índice
      </button>
    </header>
  );
}
