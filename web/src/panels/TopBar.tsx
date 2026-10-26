import { useEffect, useRef, useState } from "react";
import { cases } from "../mock";
import { ThemePicker } from "./ThemePicker";
import { useReview, useVisible } from "../store";

export function TopBar() {
  const { analysis, selected, verdicts, show, select, toggleShow } = useReview();
  const visible = useVisible();
  const ok = visible.tour.filter((id) => verdicts[id] === "ok").length;
  const doubts = visible.tour.filter((id) => verdicts[id] === "doubt").length;
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

      <div className="topbar-progress">
        <span>
          <strong>{ok}</strong> de {visible.tour.length} entendidos
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
      <ThemePicker />
      <button className={`btn btn-ghost ${show.index ? "is-on" : ""}`} onClick={() => toggleShow("index")}>
        ☰ Índice
      </button>
    </header>
  );
}

/** Cambiar de rama recarga con el caso nuevo: cada una tiene su mapa y sus veredictos */
function BranchPicker({ head }: { head: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  return (
    <span className="branch-picker" ref={ref}>
      <button className="pill pill-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        {head} <span className="caret">▾</span>
      </button>
      {open && (
        <ul className="branch-menu">
          {cases.map((c) => (
            <li key={c.head}>
              <a className={c.head === head ? "is-current" : ""} href={`?caso=${encodeURIComponent(c.head)}`}>
                <span className="mono">{c.head}</span>
                <span className="branch-title">{c.title}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </span>
  );
}
