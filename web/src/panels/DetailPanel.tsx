import type { Block, Decision, Example, HunkView } from "../../../src/shared/analysis";
import { Code, useTokens } from "../highlight";
import { useReview, useVisible } from "../store";

export function DetailPanel() {
  const { analysis, selected } = useReview();
  const block = analysis.blocks.find((b) => b.id === selected);
  const decision = analysis.decisions.find((d) => d.id === selected);
  return (
    <aside className="detail">
      {block ? <BlockDetail block={block} /> : decision ? <DecisionDetail decision={decision} /> : <Overview />}
    </aside>
  );
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

      <Closing id={block.id} question="¿Te cierra este cambio?" />
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

const STATUS = { nueva: "Condición nueva", cambió: "Condición cambiada", igual: "Condición sin cambios" } as const;

/** Un rombo: qué se pregunta, a dónde va cada respuesta y qué camino toma cada dato */
function DecisionDetail({ decision: d }: { decision: Decision }) {
  const { analysis, select } = useReview();
  const where = (o: Decision["outcomes"][number]) =>
    o.end ? o.end.label : `sigue a ${analysis.blocks.find((b) => b.id === o.to)?.title ?? o.to}`;

  return (
    <div className="detail-inner" key={d.id}>
      <p className="eyebrow">
        {d.evidence} · <span className={`status-tag status-${d.status}`}>{STATUS[d.status]}</span>
      </p>
      <h1 className="detail-title">{d.condition}</h1>
      <p className="lead">{d.summary}</p>

      <div className="outcomes">
        {d.outcomes.map((o) => (
          <button key={o.id} className={`outcome ${o.end ? `tone-${o.end.tone}` : ""}`} onClick={() => o.to && select(o.to)} disabled={!o.to}>
            <span className="outcome-answer">{o.label}</span>
            <span className="outcome-arrow">→</span>
            <span className="outcome-where">{where(o)}</span>
          </button>
        ))}
      </div>

      {d.cases && d.cases.length > 0 && (
        <div className="cases">
          <div className="example-head">
            <span>Qué camino toma cada dato</span>
            <span className="source">estimado por la AI</span>
          </div>
          {d.cases.map((c) => {
            const o = d.outcomes.find((x) => x.id === c.outcome);
            return (
              <div key={c.input} className={`case ${c.warning ? "has-warning" : ""}`}>
                <code className="case-input">{c.input}</code>
                <span className={`case-answer ${o?.end ? `tone-${o.end.tone}` : ""}`}>{o?.label}</span>
                {(c.before || c.warning) && (
                  <span className="case-note">
                    {c.before && <span className="case-before">antes: {c.before}</span>}
                    {c.warning && <span className="case-warning">! {c.warning}</span>}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {d.hunk && <Snippet hunk={d.hunk} />}

      <Closing id={d.id} question="¿Te cierra esta condición?" />
    </div>
  );
}

/** Cerrar un paso es una decisión explícita, separada de moverse por el recorrido */
function Closing({ id, question }: { id: string; question: string }) {
  const { verdicts, setVerdict, tourStep } = useReview();
  const tour = useVisible().tour;
  const verdict = verdicts[id];
  const pos = tour.indexOf(id);
  return (
    <>
      <section className={`verdict ${verdict ? `is-${verdict}` : ""}`}>
        <p className="verdict-q">{question}</p>
        <div className="verdict-options">
          <button className={`verdict-btn ok ${verdict === "ok" ? "is-on" : ""}`} onClick={() => setVerdict(id, "ok")} aria-pressed={verdict === "ok"}>
            <span className="verdict-icon">✓</span>
            Lo entendí
          </button>
          <button className={`verdict-btn doubt ${verdict === "doubt" ? "is-on" : ""}`} onClick={() => setVerdict(id, "doubt")} aria-pressed={verdict === "doubt"}>
            <span className="verdict-icon">?</span>
            Tengo dudas
          </button>
        </div>
      </section>

      <nav className="stepper">
        {/* Una rayita por paso: dónde estás y cómo cerraste cada uno */}
        <div className="steps" aria-label={`Paso ${pos + 1} de ${tour.length}`}>
          {tour.map((t, i) => (
            <span key={t} className={`step-seg ${verdicts[t] ? `is-${verdicts[t]}` : ""} ${i === pos ? "is-current" : ""}`} />
          ))}
        </div>
        <div className="stepper-btns">
          <button className="btn" onClick={() => tourStep(-1)} disabled={pos <= 0}>
            ← Anterior
          </button>
          <button className="btn" onClick={() => tourStep(1)} disabled={pos === tour.length - 1}>
            Siguiente →
          </button>
        </div>
      </nav>
    </>
  );
}
