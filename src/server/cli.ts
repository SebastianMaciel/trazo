#!/usr/bin/env node
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import open from "open";
import { createApp } from "./app.js";
import { saveAnalysis } from "./cache.js";
import { fileAt, getRevDiff, repoRoot } from "./git.js";
import { renderNumbered } from "./numbered.js";
import { validateDraft } from "./validate.js";

const PORT = Number(process.env.TRAZO_PORT ?? 4319);
const HOST = "127.0.0.1";
const URL_BASE = `http://${HOST}:${PORT}`;
const WEB_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "dist", "web");

const HELP = `trazo: review visual de un PR/MR

  trazo diff <repo> <base> <head> [--out archivo]
      El diff numerado para analizar. base y head: ramas, origin/develop, FETCH_HEAD o shas
  trazo validate <repo> <análisis.json>
      Valida el análisis contra el diff. Si está bien lo guarda y dice cómo abrirlo
  trazo serve [repo] [--no-open]
      Levanta la web en ${URL_BASE}
  trazo open <clave>
      Abre un análisis guardado en el browser

Las rutas pueden ser relativas a donde estás parado.`;

// pnpm --dir corre el script adentro de trazo: las rutas relativas son de donde lo llamaste
const here = (p: string) => resolve(process.env.INIT_CWD ?? process.cwd(), p);

function fail(msg: string): never {
  console.error(`trazo: ${msg}`);
  process.exit(1);
}

async function root(p: string | undefined) {
  if (!p) fail(`falta el repo.\n\n${HELP}`);
  try {
    return await repoRoot(here(p));
  } catch {
    fail(`"${p}" no es un repo git`);
  }
}

async function cmdDiff(args: string[]) {
  const outAt = args.indexOf("--out");
  const out = outAt === -1 ? undefined : args[outAt + 1];
  const [repo, base, head] = args.filter((a, i) => !a.startsWith("--") && (outAt === -1 || i !== outAt + 1));
  if (!base || !head) fail(`faltan base y head.\n\n${HELP}`);
  const r = await root(repo);
  const d = await getRevDiff(r, base, head).catch((e: Error) => fail(e.message));
  const text = renderNumbered(d);
  if (!out) return void process.stdout.write(text);
  await writeFile(here(out), text);
  const hunks = (text.match(/^\[h\d+\]/gm) ?? []).length;
  console.log(`base ${d.base.sha}\nhead ${d.head.sha}\n${d.files.length} archivos, ${hunks} hunks → ${here(out)}`);
}

async function cmdValidate(args: string[]) {
  const [repo, file] = args.filter((a) => !a.startsWith("--"));
  if (!file) fail(`falta el archivo del análisis.\n\n${HELP}`);
  const r = await root(repo);
  let draft: { base?: string; head?: string };
  try {
    draft = JSON.parse(await readFile(here(file), "utf8"));
  } catch (e) {
    fail(`no pude leer ${file} como JSON: ${(e as Error).message}`);
  }
  if (typeof draft.base !== "string" || typeof draft.head !== "string") fail("el análisis necesita base y head: los shas que imprimió trazo diff");
  const d = await getRevDiff(r, draft.base, draft.head).catch((e: Error) => fail(e.message));
  const count = async (sha: string, path: string) => {
    const text = await fileAt(r, sha, path);
    return text === null ? null : text.split("\n").length - (text.endsWith("\n") ? 1 : 0);
  };
  const { errors, analysis } = await validateDraft(draft, d, basename(r), count);
  if (errors.length || !analysis?.key) {
    console.error(`El análisis tiene ${errors.length} ${errors.length === 1 ? "problema" : "problemas"}. Corregilos y volvé a validar:\n`);
    for (const e of errors) console.error(`- ${e}`);
    process.exit(1);
  }
  await saveAnalysis({ ...analysis, key: analysis.key });
  console.log(`Listo: ${analysis.blocks.length} bloques, ${analysis.edges.length} flechas, ${analysis.decisions.length} rombos.\nclave ${analysis.key}\n${URL_BASE}/?a=${analysis.key}`);
}

function cmdServe(args: string[]) {
  const noOpen = args.includes("--no-open");
  const repo = args.find((a) => !a.startsWith("--"));
  return (repo ? root(repo) : Promise.resolve(null)).then((r) => {
    const app = createApp(r);
    // En build, el server también sirve la web. En dev la sirve Vite
    if (existsSync(WEB_DIR)) {
      const MIME: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".woff": "font/woff" };
      app.get("*", async (c) => {
        const rel = normalize(c.req.path).replace(/^(\.\.[/\\])+/, "");
        let file = join(WEB_DIR, rel);
        if (!file.startsWith(WEB_DIR) || !existsSync(file) || extname(file) === "") file = join(WEB_DIR, "index.html");
        return c.body(await readFile(file), 200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
      });
    } else console.warn(`trazo: no está compilada la web. Corré "pnpm build" en ${dirname(dirname(WEB_DIR))}`);

    const server = serve({ fetch: app.fetch, port: PORT, hostname: HOST }, () => {
      console.log(`trazo${r ? ` · ${r}` : ""}\n→ ${URL_BASE}`);
      if (!noOpen && existsSync(WEB_DIR)) open(URL_BASE);
    });
    server.on("error", (e: NodeJS.ErrnoException) => {
      // Ya hay uno corriendo: alcanza con ese, sirve todos los análisis guardados
      if (e.code === "EADDRINUSE") {
        console.log(`trazo ya está corriendo en ${URL_BASE}`);
        process.exit(0);
      }
      fail(e.message);
    });
  });
}

async function cmdOpen(args: string[]) {
  const key = args.find((a) => !a.startsWith("--"));
  if (!key) fail(`falta la clave.\n\n${HELP}`);
  const up = await fetch(`${URL_BASE}/api/analysis/${encodeURIComponent(key)}`).then((r) => r.ok, () => null);
  if (up === null) fail(`no está corriendo el server. Levantalo de fondo con "trazo serve --no-open" y volvé a abrir`);
  if (!up) fail(`no hay un análisis guardado con la clave ${key}`);
  await open(`${URL_BASE}/?a=${encodeURIComponent(key)}`);
  console.log(`${URL_BASE}/?a=${key}`);
}

const [cmd, ...rest] = process.argv.slice(2);
const commands: Record<string, (a: string[]) => unknown> = { diff: cmdDiff, validate: cmdValidate, serve: cmdServe, open: cmdOpen };
if (cmd === "help" || cmd === "--help" || cmd === "-h") console.log(HELP);
else if (cmd && commands[cmd]) Promise.resolve(commands[cmd](rest)).catch((e: Error) => fail(e.message));
// Sin comando: como antes, la web del repo donde estás
else cmdServe(cmd ? [cmd, ...rest] : [process.cwd()]);
