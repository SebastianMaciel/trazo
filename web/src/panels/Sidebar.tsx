import { useState } from "react";
import { useReview } from "../store";

export function Sidebar() {
  const { analysis, selected, checked, select } = useReview();
  const [q, setQ] = useState("");
  const term = q.trim().toLowerCase();

  const done = analysis.blocks.filter((b) => checked[b.id]).length;
  const pct = Math.round((done / analysis.blocks.length) * 100);

  return (
    <aside className="sidebar">
      <div className="progress">
        <div className="progress-text">
          <strong>{done}</strong> de {analysis.blocks.length} entendidos
        </div>
        <div className="progress-bar">
          <div style={{ width: `${pct}%` }} />
        </div>
      </div>

      <input className="filter" placeholder="Filtrar…" value={q} onChange={(e) => setQ(e.target.value)} />

      <nav className="tree">
        {analysis.groups.map((g) => {
          const blocks = analysis.blocks.filter(
            (b) =>
              b.group === g.id &&
              (!term || b.title.toLowerCase().includes(term) || b.file.toLowerCase().includes(term) || b.rows.some((r) => r.label.toLowerCase().includes(term))),
          );
          if (!blocks.length) return null;
          return (
            <section key={g.id} className={`tree-group ${g.minor ? "is-minor" : ""}`}>
              <h3>
                <span className={`risk-dot risk-${g.risk}`} />
                {g.title}
              </h3>
              <ul>
                {blocks.map((b) => (
                  <li key={b.id}>
                    <button className={`tree-item ${selected === b.id ? "is-selected" : ""}`} onClick={() => select(b.id)}>
                      <span className={`tree-check ${checked[b.id] ? "is-on" : ""}`}>{checked[b.id] ? "✓" : ""}</span>
                      <span className="tree-name">{b.title}</span>
                      {b.warnings?.length ? <span className="warn-dot">!</span> : null}
                      <span className="tree-count">{b.rows.length}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </nav>
    </aside>
  );
}
