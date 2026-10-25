import { Hono } from "hono";
import { GitError, getDiff, repoInfo } from "./git.js";

export function createApp(root: string) {
  const app = new Hono();

  app.onError((err, c) => {
    const status = err instanceof GitError ? 400 : 500;
    return c.json({ error: err.message }, status);
  });

  app.get("/api/repo", async (c) => c.json(await repoInfo(root)));

  app.get("/api/diff", async (c) => {
    const base = c.req.query("base");
    const head = c.req.query("head");
    if (!base || !head) return c.json({ error: "Faltan base y head" }, 400);
    return c.json(await getDiff(root, base, head));
  });

  return app;
}
