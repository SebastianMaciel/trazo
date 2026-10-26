import { createRoot } from "react-dom/client";
import "@fontsource-variable/space-grotesk";
import "@fontsource-variable/jetbrains-mono";
import "@fontsource-variable/inter";
import "@fontsource-variable/literata";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/600.css";
import "@fontsource/share-tech-mono";
import "@xyflow/react/dist/base.css";
import { api } from "./api";
import { setLoaded } from "./mock";
import { applyTheme, savedTheme } from "./panels/ThemePicker";
import "./styles.css";
import "./themes.css";

applyTheme(savedTheme());
const root = createRoot(document.getElementById("root")!);

/**
 * Qué análisis abrir: ?a=clave trae uno guardado, ?caso= abre una demo,
 * y sin nada abre el último guardado (o la demo si todavía no hay ninguno)
 */
async function boot() {
  const params = new URLSearchParams(location.search);
  let key = params.get("a");
  if (!key && !params.has("caso")) {
    const saved = await api.analyses().catch(() => []);
    if (saved[0]) {
      key = saved[0].key;
      params.set("a", key);
      history.replaceState(null, "", `?${params.toString()}`);
    }
  }
  if (key) setLoaded(await api.analysis(key));
  // Recién ahora: el store lee el análisis al cargarse
  const { App } = await import("./App");
  root.render(<App />);
}

boot().catch((e: Error) =>
  root.render(
    <main className="boot-error">
      <h1>No pude abrir el análisis</h1>
      <p>{e.message}</p>
      <p className="boot-hint">Fijate que trazo esté corriendo (trazo serve) y que la clave sea la que imprimió trazo validate.</p>
      <a className="btn" href="?">
        Abrir el último guardado
      </a>
    </main>,
  ),
);
