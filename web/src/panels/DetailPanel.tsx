import type { Block, Decision, Example, HunkView } from "../../../src/shared/analysis";
import type { DiffLine } from "../../../src/shared/diff";
import { Code, useTokens } from "../highlight";
import { useReview, useVisible } from "../store";

export function DetailPanel() {
  const { analysis, selected } = useReview();
  const block = analysis.blocks.find((b) => b.id === selected);
  const decision = analysis.decisions.find((d) => d.id === selected);
  return (
    <aside className="detail">
      {/* Arriba scrollea el contenido; los botones quedan siempre en el mismo lugar, abajo de todo */}
      <div className="detail-scroll">
        {block ? <BlockDetail block={block} /> : decision ? <DecisionDetail decision={decision} /> : <Overview />}
      </div>
      {block || decision ? <Stepper id={selected!} /> : <StartFoot />}
    </aside>
  );
}

const VERDICT = { resuelve: "Lo resuelve", "con-detalles": "Lo resuelve, con detalles", "no-resuelve": "No lo resuelve" } as const;

/** La primera pantalla: de dónde venimos, adónde queremos llegar y qué tanto lo logra el PR */
function Overview() {
  const analysis = useVisible();
  const { context: c } = analysis;
  return (
    <div className="detail-inner">
      <p className="eyebrow">El cambio</p>
      <h1 className="detail-title">{analysis.title}</h1>

      <ol className="story">
        <li>
          <span className="story-label">Veníamos de</span>
          <p>{c.before}</p>
        </li>
        <li className="is-problem">
          <span className="story-label">El problema</span>
          <p>{c.problem}</p>
        </li>
        <li className="is-goal">
          <span className="story-label">Adónde queremos llegar</span>
          <p>{c.goal}</p>
        </li>
      </ol>

      <section className={`pr-verdict is-${c.verdict.status}`}>
        <span className="pr-verdict-label">Este PR · {VERDICT[c.verdict.status]}</span>
        <p>{c.verdict.text}</p>
      </section>

      <p className="eyebrow">El recorrido</p>
      <ol className="overview">
        {analysis.groups.map((g, i) => (
          <li key={g.id}>
            <span className="group-n">{i + 1}</span>
            <span>{g.title}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function StartFoot() {
  const { tourStep, verdicts, select } = useReview();
  const tour = useVisible().tour;
  const next = tour.find((id) => !verdicts[id]);
  const resumed = next !== tour[0];
  return (
    <nav className="stepper">
      {next ? (
        <button className="btn btn-primary btn-big btn-wide" onClick={() => (resumed ? select(next) : tourStep(1))}>
          {resumed ? "Seguir el recorrido" : "Empezar el recorrido"}
          <kbd>→</kbd>
        </button>
      ) : (
        <p className="all-done">Cerraste todos los bloques.</p>
      )}
    </nav>
  );
}

function BlockDetail({ block }: { block: Block }) {
  return (
    <div className="detail-inner" key={block.id}>
      <p className="eyebrow">
        {block.file}
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

      {focusHunk(block.hunks) && <Snippet hunk={focusHunk(block.hunks)!} total={block.hunks.reduce((n, h) => n + h.lines.filter((l) => l.kind !== "ctx").length, 0)} />}

      <Closing id={block.id} question="¿Te cierra este cambio?" />
    </div>
  );
}

function ExampleFlow({ ex }: { ex: Example }) {
  return (
    <div className="example">
      <div className="example-head">
        <span>Qué pasa con un dato real</span>
        <span className={`source ${ex.executed ? "is-run" : ""}`}>{ex.executed ? "lo corrimos de verdad" : "lo estimó la AI, verificalo"}</span>
      </div>
      <div className="example-flow">
        <div className="value value-in">{nb(ex.input)}</div>
        <div className="wire">
          <span className="wire-dot" />
        </div>
        <div className="outs">
          <div className="value value-before">
            <span className="value-tag">antes</span>
            {nb(ex.before)}
          </div>
          <div className="value value-after">
            <span className="value-tag">ahora</span>
            {nb(ex.after)}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Los montos no se parten entre "$" y el número */
const nb = (t: string) => t.replace(/\$ (?=[\d-])/g, "$\u00a0");

/** Imports, comentarios y líneas vacías: no explican el cambio */
const NOISE = /^\s*(import\b|export \* from|\/\/|\/\*|\*)|^\s*$/;
const WARN = /\bojo:/i;
const meaningful = (l: DiffLine) => l.kind !== "ctx" && !NOISE.test(l.text);

/** Qué mostrar del hunk: la nota con "Ojo" si hay, si no la primera que toca código de verdad */
function focusOf(h: HunkView) {
  const notes = h.notes ?? [];
  const note = notes.find((n) => WARN.test(n.text)) ?? notes.find((n) => h.lines.slice(n.from, n.to + 1).some(meaningful));
  const span = note ? h.lines.slice(note.from, note.to + 1) : h.lines;
  const lines = span.filter(meaningful);
  return { lines: lines.length ? lines : span.filter((l) => l.kind !== "ctx"), note: note?.text, warn: !!note && WARN.test(note.text) };
}

/** De todos los hunks del bloque, el que tiene el aviso; si no, el primero con código que importe */
function focusHunk(hunks: HunkView[]) {
  return hunks.find((h) => h.notes?.some((n) => WARN.test(n.text))) ?? hunks.find((h) => h.lines.some(meaningful)) ?? hunks[0];
}

/** Las líneas que importan con su explicación. Un click abre el código completo en el panel de al lado */
function Snippet({ hunk, total }: { hunk: HunkView; total: number }) {
  const { codeOpen, setCodeOpen } = useReview();
  const focus = focusOf(hunk);
  const shown = focus.lines.slice(0, 6);
  // Se saca la sangría que comparten todas, para que no sobre margen a la izquierda
  const cut = Math.min(...shown.map((l) => l.text.match(/^[ \t]*/)![0].length));
  const texts = shown.map((l) => l.text.slice(cut));
  const tokens = useTokens(hunk.file, texts);
  const rest = total - shown.length;
  return (
    <button className={`snippet ${codeOpen ? "is-open" : ""} ${focus.warn ? "is-warn" : ""}`} onClick={() => setCodeOpen(!codeOpen)}>
      {shown.map((l, i) => (
        <div key={i} className={`snip-line ${l.kind}`}>
          <Code tokens={tokens?.[i]} text={texts[i]} />
        </div>
      ))}
      {focus.note && <p className="snip-note">{focus.note}</p>}
      <div className="snip-foot">
        {rest > 0 ? `+${rest} ${rest === 1 ? "línea" : "líneas"} · ` : ""}
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
            <span className="source">lo estimó la AI, verificalo</span>
          </div>
          {d.cases.map((c) => {
            const o = d.outcomes.find((x) => x.id === c.outcome);
            return (
              <div key={c.input} className={`case ${c.warning ? "has-warning" : ""}`}>
                <code className="case-input">{nb(c.input)}</code>
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

      {d.hunk && <Snippet hunk={d.hunk} total={d.hunk.lines.filter((l) => l.kind !== "ctx").length} />}

      <Closing id={d.id} question="¿Te cierra esta condición?" />
    </div>
  );
}

/** Cerrar un paso es una decisión explícita, separada de moverse por el recorrido */
function Closing({ id, question }: { id: string; question: string }) {
  const { verdicts, setVerdict } = useReview();
  const verdict = verdicts[id];
  return (
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
  );
}

/** Moverse por el recorrido. También con las flechas del teclado */
function Stepper({ id }: { id: string }) {
  const { verdicts, tourStep } = useReview();
  const tour = useVisible().tour;
  const pos = tour.indexOf(id);
  return (
    <nav className="stepper">
      {/* Una rayita por paso: dónde estás y cómo cerraste cada uno */}
      <div className="steps" aria-label={`Paso ${pos + 1} de ${tour.length}`}>
        {tour.map((t, i) => (
          <span key={t} className={`step-seg ${verdicts[t] ? `is-${verdicts[t]}` : ""} ${i === pos ? "is-current" : ""}`} />
        ))}
      </div>
      <div className="stepper-btns">
        <button className="btn" onClick={() => tourStep(-1)} disabled={pos <= 0}>
          <kbd>←</kbd>
          Anterior
        </button>
        <button className="btn" onClick={() => tourStep(1)} disabled={pos === tour.length - 1}>
          Siguiente
          <kbd>→</kbd>
        </button>
      </div>
    </nav>
  );
}
