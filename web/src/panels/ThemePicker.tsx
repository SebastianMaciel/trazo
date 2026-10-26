import { useEffect, useRef, useState } from "react";

/** Los temas para probar. Los colores de acá son solo la muestra del menú; los de verdad están en themes.css */
export const THEMES = [
  { id: "noche", name: "Noche", note: "el de siempre", swatch: ["#080d1c", "#111a33", "#f5b942", "#4ade80", "#fb7185"], display: "Space Grotesk Variable" },
  { id: "tinta", name: "Tinta", note: "editorial, serif y bermellón", swatch: ["#14110e", "#211c17", "#ff5b35", "#9fcf7a", "#efe6d6"], display: "Fraunces Variable" },
  { id: "fosforo", name: "Fósforo", note: "monitor CRT, todo mono", swatch: ["#030805", "#08150c", "#b6f7c6", "#39ff7a", "#ffb300"], display: "VT323" },
  { id: "plano", name: "Plano", note: "papel de plano azul prusia", swatch: ["#0a2342", "#0f305a", "#f1f6ff", "#7ff0c3", "#ffe14d"], display: "Archivo Variable" },
  { id: "acido", name: "Ácido", note: "grafito brutalista, cero curvas", swatch: ["#0e0e0e", "#191919", "#f4f4f0", "#ff3d71", "#d4ff00"], display: "Unbounded Variable" },
  { id: "bordo", name: "Bordó", note: "terciopelo y oro rosado", swatch: ["#170b10", "#26131b", "#c8a2ff", "#a3d9a5", "#f0b38a"], display: "Instrument Serif" },
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
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  const pick = (id: ThemeId) => {
    applyTheme(id);
    setCurrent(id);
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
