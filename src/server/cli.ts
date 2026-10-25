#!/usr/bin/env node
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import open from "open";
import { createApp } from "./app.js";
import { repoRoot } from "./git.js";

const PORT = Number(process.env.TRAZO_PORT ?? 4319);
const HOST = "127.0.0.1";
const args = process.argv.slice(2);
const noOpen = args.includes("--no-open");
const target = args.find((a) => !a.startsWith("--")) ?? process.cwd();

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

async function main() {
  let root: string;
  try {
    root = await repoRoot(target);
  } catch {
    console.error(`trazo: "${target}" no es un repo git. Corrélo adentro de un repo o pasale la carpeta: trazo ../mi-repo`);
    process.exit(1);
  }

  const app = createApp(root);

  // En build, el server también sirve la web. En dev la sirve Vite.
  const webDir = join(dirname(fileURLToPath(import.meta.url)), "..", "web");
  if (existsSync(webDir)) {
    app.get("*", async (c) => {
      const rel = normalize(c.req.path).replace(/^(\.\.[/\\])+/, "");
      let file = join(webDir, rel);
      if (!file.startsWith(webDir) || !existsSync(file) || extname(file) === "") file = join(webDir, "index.html");
      return c.body(await readFile(file), 200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
    });
  }

  serve({ fetch: app.fetch, port: PORT, hostname: HOST }, () => {
    const url = `http://${HOST}:${PORT}`;
    console.log(`trazo · ${root}\n→ ${url}`);
    if (!noOpen && existsSync(webDir)) open(url);
  });
}

main();
