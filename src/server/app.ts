import { Hono } from "hono";
import { listAnalyses, loadAnalysis } from "./cache.js";
import { GitError, getDiff, repoInfo } from "./git.js";

/** root: el repo de donde leer ramas y diffs. Sin repo, el server solo sirve los análisis guardados */
export function createApp(root: string | null) {
  const app = new Hono();

  app.onError((err, c) => {
    const status = err instanceof GitError ? 400 : 500;
    return c.json({ error: err.message }, status);
  });

  app.get("/api/analyses", async (c) => c.json(await listAnalyses()));

  app.get("/api/analysis/:key", async (c) => {
    const a = await loadAnalysis(c.req.param("key"));
    return a ? c.json(a) : c.json({ error: "No hay un análisis guardado con esa clave" }, 404);
  });

  app.get("/api/repo", async (c) => (root ? c.json(await repoInfo(root)) : c.json({ error: "El server no tiene repo" }, 400)));

  app.get("/api/diff", async (c) => {
    const base = c.req.query("base");
    const head = c.req.query("head");
    if (!root) return c.json({ error: "El server no tiene repo" }, 400);
    if (!base || !head) return c.json({ error: "Faltan base y head" }, 400);
    return c.json(await getDiff(root, base, head));
  });

  return app;
}
