import { useEffect, useRef, useState } from "react";

/** Los temas para probar. Los colores de acá son solo la muestra del menú; los de verdad están en themes.css */
export const THEMES = [
  { id: "noche", name: "Noche", note: "el de siempre", swatch: ["#080d1c", "#111a33", "#f5b942", "#4ade80", "#fb7185"], display: "Space Grotesk Variable" },
  { id: "nord", name: "Nord", note: "azules árticos apagados", swatch: ["#242933", "#3b4252", "#88c0d0", "#a3be8c", "#b48ead"], display: "Inter Variable" },
  { id: "github", name: "GitHub", note: "el dark de github.com", swatch: ["#010409", "#151b23", "#4493f8", "#3fb950", "#f85149"], display: "Inter Variable" },
  { id: "matrix", name: "Matrix", note: "verde, de noche y tranquilo", swatch: ["#070d0a", "#15241c", "#5ee08f", "#7fd6c2", "#d7c96b"], display: "Inter Variable" },
  { id: "ambar", name: "Ámbar", note: "monitor de fósforo ámbar", swatch: ["#0e0902", "#241808", "#ffb000", "#ffd27a", "#ff6a3d"], display: "IBM Plex Mono" },
  { id: "muthur", name: "MU-TH-UR 6000", note: "la computadora de la Nostromo", swatch: ["#020605", "#0a1c17", "#bfffe9", "#7dffcb", "#ff7a6e"], display: "Share Tech Mono" },
  { id: "paper", name: "Paper", note: "claro, papel de e-reader", swatch: ["#e9e4d6", "#f6f2e8", "#22201b", "#8a4b12", "#3f6b2a"], display: "Literata Variable" },
  { id: "psycho", name: "Psycho", note: "claro, para los que programan con el sol de frente", swatch: ["#f3f4f6", "#ffffff", "#16181d", "#0a66d6", "#cf222e"], display: "Inter Variable" },
] as const;

type ThemeId = (typeof THEMES)[number]["id"];
const KEY = "trazo:theme";

export function savedTheme(): ThemeId {
  try {
    const t = localStorage.getItem(KEY);
    return THEMES.some((x) => x.id === t) ? (t as ThemeId) : "noche";
  } catch {
    return "noche";
  }
}

export function applyTheme(id: ThemeId) {
  if (id === "noche") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = id;
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* sin storage, dura lo que la pestaña */
  }
}

export function ThemePicker() {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState(savedTheme);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const pick = (id: ThemeId) => {
    applyTheme(id);
    setCurrent(id);
    setOpen(false);
  };

  return (
    <div className="theme-picker" ref={ref}>
      <button className="btn btn-ghost" onClick={() => setOpen(!open)} aria-expanded={open}>
        Tema
      </button>
      {open && (
        <ul className="theme-menu">
          {THEMES.map((t) => (
            <li key={t.id}>
              <button className={`theme-item ${t.id === current ? "is-current" : ""}`} onClick={() => pick(t.id)}>
                <span className="theme-swatch" style={{ background: t.swatch[0] }}>
                  {t.swatch.slice(1).map((c) => (
                    <span key={c} style={{ background: c }} />
                  ))}
                </span>
                <span className="theme-text">
                  <span className="theme-name" style={{ fontFamily: `"${t.display}"` }}>
                    {t.name}
                  </span>
                  <span className="theme-note">{t.note}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
