import type { Block, Example, HunkView } from "../../../src/shared/analysis";
import { Code, useTokens } from "../highlight";
import { useReview, useVisible } from "../store";

export function DetailPanel() {
  const { analysis, selected } = useReview();
  const block = analysis.blocks.find((b) => b.id === selected);
  return <aside className="detail">{block ? <BlockDetail block={block} /> : <Overview />}</aside>;
}

function Overview() {
  const { tourStep, verdicts, select } = useReview();
  const analysis = useVisible();
  const next = analysis.tour.find((id) => !verdicts[id]);
  const resumed = next !== analysis.tour[0];
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
      {next ? (
        <button className="btn btn-primary btn-big btn-wide" onClick={() => (resumed ? select(next) : tourStep(1))}>
          {resumed ? "Seguir el recorrido →" : "Empezar el recorrido →"}
        </button>
      ) : (
        <p className="all-done">Cerraste todos los bloques.</p>
      )}
    </div>
  );
}

function BlockDetail({ block }: { block: Block }) {
  const { analysis, verdicts, setVerdict, tourStep, select } = useReview();
  const tour = useVisible().tour;
  const verdict = verdicts[block.id];
  const incoming = analysis.edges.filter((e) => e.to === block.id);
  const outgoing = analysis.edges.filter((e) => e.from === block.id);
  const name = (id: string) => analysis.blocks.find((b) => b.id === id)?.title ?? id;
  const pos = tour.indexOf(block.id);

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
        <Snippet key={i} hunk={h} />
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

      {/* Cerrar el bloque es una decisión, separada de moverse */}
      <section className={`verdict ${verdict ? `is-${verdict}` : ""}`}>
        <p className="verdict-q">¿Te cierra este cambio?</p>
        <div className="verdict-options">
          <button className={`verdict-btn ok ${verdict === "ok" ? "is-on" : ""}`} onClick={() => setVerdict(block.id, "ok")} aria-pressed={verdict === "ok"}>
            <span className="verdict-icon">✓</span>
            Lo entendí
          </button>
          <button className={`verdict-btn doubt ${verdict === "doubt" ? "is-on" : ""}`} onClick={() => setVerdict(block.id, "doubt")} aria-pressed={verdict === "doubt"}>
            <span className="verdict-icon">?</span>
            Tengo dudas
          </button>
        </div>
      </section>

      <nav className="stepper">
        <button className="btn" onClick={() => tourStep(-1)} disabled={pos <= 0}>
          ← Anterior
        </button>
        <span className="stepper-pos">{pos === -1 ? "fuera del recorrido" : `${pos + 1} / ${tour.length}`}</span>
        <button className="btn" onClick={() => tourStep(1)} disabled={pos === tour.length - 1}>
          Siguiente →
        </button>
      </nav>
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

/** Solo las líneas que cambiaron. Un click abre el diff completo en el panel de al lado */
function Snippet({ hunk }: { hunk: HunkView }) {
  const { codeOpen, setCodeOpen } = useReview();
  const changed = hunk.lines.filter((l) => l.kind !== "ctx");
  const shown = changed.slice(0, 5);
  const tokens = useTokens(hunk.file, shown.map((l) => l.text));
  return (
    <button className={`snippet ${codeOpen ? "is-open" : ""}`} onClick={() => setCodeOpen(!codeOpen)}>
      {shown.map((l, i) => (
        <div key={i} className={`snip-line ${l.kind}`}>
          <Code tokens={tokens?.[i]} text={l.text.trim()} />
        </div>
      ))}
      <div className="snip-foot">
        {changed.length > shown.length ? `+${changed.length - shown.length} ${changed.length - shown.length === 1 ? "línea" : "líneas"} · ` : ""}
        {codeOpen ? "Cerrar código" : "Ver código completo →"}
      </div>
    </button>
  );
}
