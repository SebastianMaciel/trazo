import { useState } from "react";
import { VERDICT_MARK, layerOf, useReview, useVisible } from "../store";

export function Sidebar() {
  const { analysis: raw, selected, verdicts, select, show, toggleShow } = useReview();
  const analysis = useVisible();
  const [q, setQ] = useState("");
  const term = q.trim().toLowerCase();
  const count = (layer: "tests" | "minor") => raw.blocks.filter((b) => layerOf(raw, b) === layer).length;

  return (
    <aside className="sidebar">
      <input className="filter" placeholder="Filtrar…" value={q} onChange={(e) => setQ(e.target.value)} />

      <nav className="tree">
        {analysis.groups.map((g, gi) => {
          const groupOf = (id: string) => analysis.blocks.find((b) => b.id === (analysis.decisions.find((d) => d.id === id)?.from ?? id))?.group;
          const items = analysis.tour
            .filter((id) => groupOf(id) === g.id)
            .map((id) => {
              const b = analysis.blocks.find((x) => x.id === id);
              const d = analysis.decisions.find((x) => x.id === id);
              const text = b ? [b.title, b.file, ...b.rows.map((r) => r.label)] : [d!.condition];
              return { id, title: b ? b.title : d!.condition, decision: !!d, warn: !!b?.warnings?.length, count: b?.rows.length ?? d!.outcomes.length, text: text.join(" ").toLowerCase() };
            })
            .filter((it) => !term || it.text.includes(term));
          if (!items.length) return null;
          return (
            <section key={g.id} className={`tree-group ${g.minor ? "is-minor" : ""}`}>
              <h3>
                <span className="group-n">{gi + 1}</span>
                {g.title}
              </h3>
              <ul>
                {items.map((it) => (
                  <li key={it.id}>
                    <button className={`tree-item ${it.decision ? "is-decision" : ""} ${selected === it.id ? "is-selected" : ""}`} onClick={() => select(it.id)}>
                      <span className={`tree-check ${verdicts[it.id] ? `is-${verdicts[it.id]}` : ""}`}>{verdicts[it.id] ? VERDICT_MARK[verdicts[it.id]] : ""}</span>
                      <span className="tree-step">{analysis.tour.indexOf(it.id) + 1}</span>
                      {it.decision && <span className="tree-diamond">◇</span>}
                      <span className="tree-name">{it.title}</span>
                      {it.warn ? <span className="warn-dot">!</span> : null}
                      <span className="tree-count">{it.count}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </nav>
      {/* Lo que el recorrido deja afuera por default, al pie para no competir con la lista */}
      <div className="layers">
        {(["tests", "minor"] as const).map((l) => (
          <button key={l} className={`layer-row ${show[l] ? "is-on" : ""}`} onClick={() => toggleShow(l)} aria-pressed={show[l]}>
            <span className="layer-switch" />
            <span className="layer-name">{l === "tests" ? "Mostrar tests" : "Mostrar cambios menores"}</span>
            <span className="tree-count">{count(l)}</span>
          </button>
        ))}
      </div>
    </aside>
  );
}
