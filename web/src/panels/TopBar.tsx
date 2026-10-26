import { useEffect, useRef, useState } from "react";
import { api, type Saved } from "../api";
import { ThemePicker } from "./ThemePicker";
import { useReview, useVisible } from "../store";

export function TopBar() {
  const { analysis, summary, overview, setOverview, verdicts, show, toggleShow, openSummary } = useReview();
  const visible = useVisible();
  const count = (v: string) => visible.tour.filter((id) => verdicts[id] === v).length;
  const ok = count("ok");
  const changes = count("change");
  const doubts = count("doubt");
  const done = ok + changes + doubts;
  const total = Math.max(1, visible.tour.length);

  return (
    <header className="topbar">
      <span className="logo">trazo</span>
      <span className="pr-title">{analysis.title}</span>
      <span className="branches">
        <span className="pill">{analysis.base}</span>
        <span className="arrow">←</span>
        <BranchPicker head={analysis.head} />
      </span>

      {/* El progreso lleva a tu review: lo que llevás marcado y el borrador */}
      <button className={`topbar-progress ${summary ? "is-on" : ""}`} onClick={openSummary}>
        <span>
          <strong>{done}</strong> de {visible.tour.length} revisados
          {changes > 0 && <span className="n-change"> · {changes} {changes === 1 ? "cambio" : "cambios"}</span>}
          {doubts > 0 && <span className="doubts"> · {doubts} {doubts === 1 ? "duda" : "dudas"}</span>}
        </span>
        <div className="progress-bar">
          <div className="pb-ok" style={{ width: `${(ok / total) * 100}%` }} />
          <div className="pb-change" style={{ width: `${(changes / total) * 100}%` }} />
          <div className="pb-doubt" style={{ width: `${(doubts / total) * 100}%` }} />
        </div>
      </button>

      <button className="btn" onClick={() => setOverview(true)} disabled={overview}>
        Vista general
      </button>
      <ThemePicker />
      <button className={`btn btn-ghost ${show.index ? "is-on" : ""}`} onClick={() => toggleShow("index")}>
        ☰ Índice
      </button>
    </header>
  );
}

/** Cambiar de análisis recarga: cada uno tiene su mapa y sus veredictos */
function BranchPicker({ head }: { head: string }) {
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState<Saved[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLSpanElement>(null);
  const current = new URLSearchParams(location.search).get("a");
  useEffect(() => {
    if (!open) return;
    // Cada vez que abrís: pudo aparecer uno nuevo mientras revisabas
    api.analyses().then(setSaved, (e: Error) => setError(e.message));
    const close = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  return (
    <span className="branch-picker" ref={ref}>
      <button className="pill pill-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        {head} <span className="caret">▾</span>
      </button>
      {open && (
        <div className="branch-menu">
          <p className="branch-section">Analizados</p>
          {error ? (
            <p className="branch-empty">No pude traer la lista: {error}</p>
          ) : saved === null ? (
            <p className="branch-empty">Cargando…</p>
          ) : saved.length === 0 ? (
            <p className="branch-empty">Todavía no hay ninguno. Pedile a Claude que analice un MR con trazo.</p>
          ) : (
            <ul>
              {saved.map((s) => (
                <li key={s.key}>
                  <a className={s.key === current ? "is-current" : ""} href={`?a=${encodeURIComponent(s.key)}`}>
                    <span className="mono">
                      {s.repo} · {s.head}
                    </span>
                    <span className="branch-title">{s.title}</span>
                    <span className="branch-meta">
                      contra {s.base} · {new Date(s.savedAt).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </span>
  );
}
