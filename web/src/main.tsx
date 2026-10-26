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
import { setLoaded } from "./source";
import { applyTheme, savedTheme } from "./panels/ThemePicker";
import "./styles.css";
import "./themes.css";

applyTheme(savedTheme());
const root = createRoot(document.getElementById("root")!);

/** Qué análisis abrir: ?a=clave trae uno guardado, y sin nada abre el último */
async function boot() {
  const params = new URLSearchParams(location.search);
  let key = params.get("a");
  if (!key) {
    const saved = await api.analyses();
    if (!saved[0]) return root.render(<Empty />);
    key = saved[0].key;
    params.set("a", key);
    history.replaceState(null, "", `?${params.toString()}`);
  }
  setLoaded(await api.analysis(key));
  // Recién ahora: el store lee el análisis al cargarse
  const { App } = await import("./App");
  root.render(<App />);
}

/** Todavía no se analizó nada: cómo pedírselo a Claude */
function Empty() {
  return (
    <main className="boot-error">
      <h1>Todavía no hay ningún análisis</h1>
      <p>Abrí Claude Code donde trabajás y pedile algo así:</p>
      <p className="boot-cmd">con ~/code/trazo analizá el MR 123 de ~/code/mi-proyecto</p>
      <p className="boot-hint">Claude sigue las instrucciones de trazo, arma el mapa, lo valida y lo abre acá.</p>
    </main>
  );
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
