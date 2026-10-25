import { useState } from "react";
import { useReview, useVisible } from "../store";

export function Sidebar() {
  const { selected, verdicts, select } = useReview();
  const analysis = useVisible();
  const [q, setQ] = useState("");
  const term = q.trim().toLowerCase();


  return (
    <aside className="sidebar">
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
                      <span className={`tree-check ${verdicts[b.id] ? `is-${verdicts[b.id]}` : ""}`}>{verdicts[b.id] === "ok" ? "✓" : verdicts[b.id] === "doubt" ? "?" : ""}</span>
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
