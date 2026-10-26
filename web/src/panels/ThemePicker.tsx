import { useEffect, useRef, useState } from "react";

/** Los colores de verdad están en themes.css; la muestra del menú se pinta con el tema mismo */
export const THEMES = [
  { id: "noche", name: "Noche", note: "el de siempre", display: "Space Grotesk Variable" },
  { id: "artico", name: "Ártico", note: "azules apagados y escarcha", display: "Inter Variable" },
  { id: "grafito", name: "Grafito", note: "gris casi negro, sobrio", display: "Inter Variable" },
  { id: "fosforo", name: "Fósforo", note: "verde, de noche y tranquilo", display: "Inter Variable" },
  { id: "ambar", name: "Ámbar", note: "monitor de fósforo ámbar", display: "IBM Plex Mono" },
  { id: "nave", name: "Nave", note: "terminal de servicio, mayúsculas y verde frío", display: "Share Tech Mono" },
  { id: "paper", name: "Paper", note: "claro, papel de e-reader", light: true, display: "Literata Variable" },
  { id: "psycho", name: "Psycho", note: "claro, para los que programan con el sol de frente", light: true, display: "Inter Variable" },
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
  paint(id);
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* sin storage, dura lo que la pestaña */
  }
}

/** Solo pinta, no guarda: para mostrar un tema mientras pasás el mouse */
function paint(id: ThemeId) {
  if (id === "noche") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = id;
}

/** Un pedacito de trazo pintado con el tema: un bloque con sus filas y una flecha que sale */
function Sample({ id }: { id: ThemeId }) {
  return (
    <span className="ts" data-theme={id} aria-hidden>
      <span className="ts-block">
        <span className="ts-head">
          <span className="ts-title">cartTotals</span>
          <span className="ts-chip">función</span>
        </span>
        <span className="ts-row ts-added">+ descuento sobre el neto</span>
        <span className="ts-row ts-modified">~ un cupón o ninguno</span>
        <span className="ts-row ts-deleted">− suma todos los cupones</span>
      </span>
      <span className="ts-wire" />
      <span className="ts-dot" />
    </span>
  );
}

export function ThemePicker() {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState(savedTheme);
  const ref = useRef<HTMLDivElement>(null);
  // Al cerrar sin elegir vuelve el que tenías
  const close = () => {
    paint(current);
    setOpen(false);
  };
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && closeRef.current();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && closeRef.current();
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const pick = (id: ThemeId) => {
    applyTheme(id);
    setCurrent(id);
    setOpen(false);
  };

  const section = (title: string, light: boolean) => (
    <section className="theme-section">
      <h4>{title}</h4>
      <div className="theme-grid">
        {THEMES.filter((t) => ("light" in t) === light).map((t) => (
          <button
            key={t.id}
            className={`theme-item ${t.id === current ? "is-current" : ""}`}
            onClick={() => pick(t.id)}
            onPointerEnter={() => paint(t.id)}
            onFocus={() => paint(t.id)}
          >
            <Sample id={t.id} />
            <span className="theme-text">
              <span className="theme-name" style={{ fontFamily: `"${t.display}"` }}>
                {t.name}
                {t.id === current && <span className="theme-on">en uso</span>}
              </span>
              <span className="theme-note">{t.note}</span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );

  return (
    <div className="theme-picker" ref={ref}>
      <button className="btn btn-ghost" onClick={() => (open ? close() : setOpen(true))} aria-expanded={open}>
        Tema
      </button>
      {open && (
        <div className="theme-menu" onPointerLeave={() => paint(current)}>
          <p className="theme-hint">Pasá el mouse para verlo en toda la app. Clic para quedártelo.</p>
          {section("Oscuros", false)}
          {section("Claros", true)}
        </div>
      )}
    </div>
  );
}
