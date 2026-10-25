import type { Block, Example } from "../../../src/shared/analysis";
import { useReview, useVisible } from "../store";

export function DetailPanel() {
  const { analysis, selected } = useReview();
  const block = analysis.blocks.find((b) => b.id === selected);
  return <aside className="detail">{block ? <BlockDetail block={block} /> : <Overview />}</aside>;
}

function Overview() {
  const { tourStep } = useReview();
  const analysis = useVisible();
  return (
    <div className="detail-inner">
      <p className="eyebrow">El cambio</p>
      <h1 className="detail-title">{analysis.title}</h1>
      <ol className="overview">
        {analysis.groups.map((g) => (
          <li key={g.id}>
            <span className={`risk-dot risk-${g.risk}`} title={`riesgo ${g.risk}`} />
            <span>{g.title}</span>
          </li>
        ))}
      </ol>
      <button className="btn btn-primary btn-big btn-wide" onClick={() => tourStep(1)}>
        Empezar el recorrido →
      </button>
    </div>
  );
}

function BlockDetail({ block }: { block: Block }) {
  const { analysis, checked, toggleCheck, tourStep, select } = useReview();
  const tour = useVisible().tour;
  const incoming = analysis.edges.filter((e) => e.to === block.id);
  const outgoing = analysis.edges.filter((e) => e.from === block.id);
  const name = (id: string) => analysis.blocks.find((b) => b.id === id)?.title ?? id;
  const isLast = tour.indexOf(block.id) === tour.length - 1;

  return (
    <div className="detail-inner" key={block.id}>
      <p className="eyebrow">
        {block.file} · <span className={`risk-tag risk-${block.risk}`}>riesgo {block.risk}</span>
      </p>
      <h1 className="detail-title mono">{block.title}</h1>
      <p className="lead">{block.summary}</p>

      {block.warnings?.map((w) => (
        <div key={w} className="warning">
          <span className="warning-icon">!</span>
          {w}
        </div>
      ))}

      {block.example && <ExampleFlow ex={block.example} />}

      {block.hunks.map((h, i) => (
        <div key={i} className="code">
          <div className="code-head">{h.section || h.file}</div>
          {h.lines.map((l, j) => (
            <div key={j} className={`line ${l.kind}`}>
              <span className="no">{l.oldNo ?? ""}</span>
              <span className="no">{l.newNo ?? ""}</span>
              <span className="mark">{l.kind === "add" ? "+" : l.kind === "del" ? "−" : ""}</span>
              <code>{l.text}</code>
            </div>
          ))}
        </div>
      ))}

      {(incoming.length > 0 || outgoing.length > 0) && (
        <div className="links">
          {incoming.map((e) => (
            <button key={e.id} className="link" onClick={() => select(e.from)}>
              <span className="link-dir">desde</span>
              <span className="mono">{name(e.from)}</span>
              <span className="link-label">{e.label}</span>
              <span className="link-ev">{e.evidence}</span>
            </button>
          ))}
          {outgoing.map((e) => (
            <button key={e.id} className="link" onClick={() => select(e.to)}>
              <span className="link-dir">hacia</span>
              <span className="mono">{name(e.to)}</span>
              <span className="link-label">{e.label}</span>
              <span className="link-ev">{e.evidence}</span>
            </button>
          ))}
        </div>
      )}

      <div className="actions">
        <button className={`btn btn-big ${checked[block.id] ? "btn-done" : ""}`} onClick={() => toggleCheck(block.id)}>
          {checked[block.id] ? "✓ Entendido" : "Lo entendí"}
        </button>
        {!isLast && (
          <button
            className="btn btn-big btn-primary"
            onClick={() => {
              if (!checked[block.id]) toggleCheck(block.id);
              tourStep(1);
            }}
          >
            Entendido, sigo →
          </button>
        )}
      </div>
    </div>
  );
}

function ExampleFlow({ ex }: { ex: Example }) {
  return (
    <div className="example">
      <div className="example-head">
        <span>Qué pasa con un dato real</span>
        <span className={`source ${ex.executed ? "is-run" : ""}`}>{ex.executed ? "ejecutado" : "estimado por la AI"}</span>
      </div>
      <div className="example-flow">
        <div className="value value-in">{ex.input}</div>
        <div className="wire">
          <span className="wire-dot" />
        </div>
        <div className="outs">
          <div className="value value-before">
            <span className="value-tag">antes</span>
            {ex.before}
          </div>
          <div className="value value-after">
            <span className="value-tag">ahora</span>
            {ex.after}
          </div>
        </div>
      </div>
    </div>
  );
}
