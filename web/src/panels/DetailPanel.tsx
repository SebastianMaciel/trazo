import { useState } from "react";
import type { Block, Decision, Example, HunkView } from "../../../src/shared/analysis";
import { Code, useTokens } from "../highlight";
import { HEADLINE, focusHunk, focusOf, stepOf, summarize, type Step } from "../review";
import { VERDICT_MARK, useReview, useVisible, type Verdict } from "../store";

export function DetailPanel() {
  const { analysis, selected, summary } = useReview();
  const block = analysis.blocks.find((b) => b.id === selected);
  const decision = analysis.decisions.find((d) => d.id === selected);
  return (
    <aside className="detail">
      {/* Arriba scrollea el contenido; los botones quedan siempre en el mismo lugar, abajo de todo */}
      {/* Cada vista arranca arriba: no hereda el scroll de la anterior */}
      <div className="detail-scroll" key={summary ? "resumen" : (selected ?? "inicio")}>
        {block ? <BlockDetail block={block} /> : decision ? <DecisionDetail decision={decision} /> : summary ? <Summary /> : <Overview />}
      </div>
      {block || decision ? <Stepper id={selected!} /> : summary ? <SummaryFoot /> : <StartFoot />}
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

      <Closing id={block.id} question="¿Cómo está este cambio?" />
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

      <Closing id={d.id} question="¿Cómo está esta condición?" />
    </div>
  );
}

const OPTIONS: { v: Verdict; label: string }[] = [
  { v: "ok", label: "Está bien" },
  { v: "change", label: "Pedir cambio" },
  { v: "doubt", label: "Tengo dudas" },
];

/** Cerrar un paso es una decisión explícita, separada de moverse por el recorrido */
function Closing({ id, question }: { id: string; question: string }) {
  const { analysis, verdicts, setVerdict, notes, setNote } = useReview();
  const verdict = verdicts[id];
  const pick = (v: Verdict) => {
    // Al pedir un cambio sobre algo que la AI ya marcó, el aviso es el punto de partida del comentario
    const warning = stepOf(analysis, id).warnings[0];
    if (v === "change" && verdict !== "change" && !notes[id] && warning) setNote(id, warning);
    setVerdict(id, v);
  };
  const writing = verdict === "change" || verdict === "doubt";
  return (
    <section className={`verdict ${verdict ? `is-${verdict}` : ""}`}>
      <p className="verdict-q">{question}</p>
      <div className="verdict-options">
        {OPTIONS.map((o) => (
          <button key={o.v} className={`verdict-btn ${o.v} ${verdict === o.v ? "is-on" : ""}`} onClick={() => pick(o.v)} aria-pressed={verdict === o.v}>
            <span className="verdict-icon">{VERDICT_MARK[o.v]}</span>
            {o.label}
          </button>
        ))}
      </div>
      {writing && (
        <textarea
          className="verdict-note"
          rows={3}
          value={notes[id] ?? ""}
          onChange={(e) => setNote(id, e.target.value)}
          placeholder={verdict === "change" ? "Qué habría que cambiar" : "Qué no te cierra"}
        />
      )}
    </section>
  );
}

/** Moverse por el recorrido. También con las flechas del teclado */
function Stepper({ id }: { id: string }) {
  const { verdicts, tourStep } = useReview();
  const a = useVisible();
  const tour = a.tour;
  const pos = tour.indexOf(id);
  const last = pos === tour.length - 1;
  const groupId = a.blocks.find((b) => b.id === (a.decisions.find((d) => d.id === id)?.from ?? id))?.group;
  const gi = a.groups.findIndex((g) => g.id === groupId);
  return (
    <nav className="stepper">
      <p className="stepper-where">
        {gi !== -1 && <span className="group-n">{gi + 1}</span>}
        {gi !== -1 && <strong>{a.groups[gi].title}</strong>}
        <span className="stepper-pos">
          paso {pos + 1} de {tour.length}
        </span>
      </p>
      {/* Una rayita por paso: dónde estás y cómo cerraste cada uno */}
      <div className="steps">
        {tour.map((t, i) => (
          <span key={t} className={`step-seg ${verdicts[t] ? `is-${verdicts[t]}` : ""} ${i === pos ? "is-current" : ""}`} />
        ))}
      </div>
      <div className="stepper-btns">
        <button className="btn" onClick={() => tourStep(-1)} disabled={pos <= 0}>
          <kbd>←</kbd>
          Anterior
        </button>
        <button className={`btn ${last ? "btn-primary" : ""}`} onClick={() => tourStep(1)}>
          {last ? "Terminar" : "Siguiente"}
          <kbd>→</kbd>
        </button>
      </div>
    </nav>
  );
}

/** El cierre: lo que pedís cambiar, tus dudas y un borrador listo para pegar en el PR */
function Summary() {
  const { analysis, verdicts, notes } = useReview();
  const tour = useVisible().tour;
  const r = summarize(analysis, tour, verdicts, notes);
  return (
    <div className="detail-inner">
      <p className="eyebrow">Tu review</p>
      <h1 className={`detail-title review-status is-${r.status}`}>{HEADLINE[r.status]}</h1>

      <StepList title="Pedís cambios" tone="change" steps={r.changes} />
      <StepList title="Tus dudas" tone="doubt" steps={r.doubts} />
      <StepList title="La AI avisó algo y lo diste por bueno" tone="warn" steps={r.okWithWarnings} hint="Fijate que haya sido a conciencia" />
      <Draft text={r.draft} />

      {r.pending.length > 0 && <Pending steps={r.pending} />}
    </div>
  );
}

function StepList({ title, tone, steps, hint }: { title: string; tone: string; steps: (Step & { note?: string })[]; hint?: string }) {
  const { select } = useReview();
  if (!steps.length) return null;
  return (
    <section className={`review-list tone-${tone}`}>
      <h2>
        {title} <span className="review-count">{steps.length}</span>
      </h2>
      {hint && <p className="review-hint">{hint}</p>}
      <ul>
        {steps.map((s) => (
          <li key={s.id}>
            <button className="review-item" onClick={() => select(s.id)}>
              <span className="review-title">{s.title}</span>
              <span className="review-where">{s.where}</span>
              {s.note ? <span className="review-note">{s.note}</span> : tone === "warn" && <span className="review-note">{s.warnings[0]}</span>}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** El texto para pegar en GitHub o GitLab, con su botón de copiar a la vista */
function Draft({ text }: { text: string }) {
  const { copy, label, state } = useCopyDraft();
  return (
    <div className="draft">
      <div className="draft-head">
        <p className="eyebrow">Borrador para el PR</p>
        <button className={`btn draft-copy ${state !== "idle" ? `is-${state}` : ""}`} onClick={copy}>
          {label}
        </button>
      </div>
      <pre>{text}</pre>
      <p className="draft-hint">Pegalo en el PR de GitHub o GitLab. Está en Markdown.</p>
    </div>
  );
}

/** Lo que falta, agrupado por intención y con aire: que se lea como una lista de pendientes, no como un bloque */
function Pending({ steps }: { steps: Step[] }) {
  const { select } = useReview();
  const groups = useVisible().groups;
  const byGroup = groups.map((g, i) => ({ g, n: i + 1, items: steps.filter((s) => s.group === g.title) })).filter((x) => x.items.length);
  return (
    <section className="pending">
      <h2 className="pending-title">
        Te {steps.length === 1 ? "falta 1 paso" : `faltan ${steps.length} pasos`}
      </h2>
      {byGroup.map(({ g, n, items }) => (
        <div key={g.id} className="pending-group">
          <h3 className="pending-group-title">
            <span className="group-n">{n}</span>
            <span>{g.title}</span>
            <span className="review-count">{items.length}</span>
          </h3>
          <ul>
            {items.map((s) => (
              <li key={s.id}>
                <button className="pending-item" onClick={() => select(s.id)}>
                  <span className="pending-name">
                    <span className="review-title">{s.title}</span>
                    <span className="pending-kind">{s.kind}</span>
                  </span>
                  <span className="review-where">{s.where}</span>
                  <span className="review-note">{s.summary}</span>
                  {s.warnings.length > 0 && (
                    <span className="review-warn">
                      ! {s.warnings.length === 1 ? "1 aviso de la AI" : `${s.warnings.length} avisos de la AI`}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

/** Copiar el borrador: avisa si salió o si el navegador no dejó */
function useCopyDraft() {
  const { analysis, verdicts, notes } = useReview();
  const tour = useVisible().tour;
  const [state, setState] = useState<"idle" | "ok" | "error">("idle");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(summarize(analysis, tour, verdicts, notes).draft);
      setState("ok");
    } catch {
      setState("error");
    }
    setTimeout(() => setState("idle"), 2200);
  };
  const label = state === "ok" ? "Copiado ✓" : state === "error" ? "No se pudo copiar" : "Copiar texto";
  return { copy, label, state };
}

function SummaryFoot() {
  const { tourStep } = useReview();
  const { copy, label } = useCopyDraft();
  return (
    <nav className="stepper">
      <div className="stepper-btns">
        <button className="btn" onClick={() => tourStep(-1)}>
          <kbd>←</kbd>
          Volver
        </button>
        <button className="btn btn-primary" onClick={copy}>
          {label}
        </button>
      </div>
    </nav>
  );
}
