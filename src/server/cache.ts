import { mkdir, readdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Analysis } from "../shared/analysis.js";

/** Los análisis validados viven fuera de cualquier repo: trazo no escribe en el código que revisa */
export const cacheDir = () => process.env.TRAZO_HOME ?? join(homedir(), ".cache", "trazo");

const KEY_RE = /^[\w.-]+$/;

export interface Saved {
  key: string;
  title: string;
  repo: string;
  base: string;
  head: string;
  savedAt: string;
}

/** Se escribe a un temporal y se renombra: nunca queda un análisis a medias */
export async function saveAnalysis(a: Analysis & { key: string }) {
  const dir = cacheDir();
  await mkdir(dir, { recursive: true });
  const file = join(dir, `${a.key}.json`);
  await writeFile(`${file}.tmp`, JSON.stringify(a));
  await rename(`${file}.tmp`, file);
  return file;
}

export async function loadAnalysis(key: string): Promise<Analysis | null> {
  if (!KEY_RE.test(key)) return null;
  try {
    return JSON.parse(await readFile(join(cacheDir(), `${key}.json`), "utf8"));
  } catch {
    return null;
  }
}

/** Los guardados, el más nuevo primero */
export async function listAnalyses(): Promise<Saved[]> {
  const dir = cacheDir();
  const names = await readdir(dir).catch(() => [] as string[]);
  const out = await Promise.all(
    names
      .filter((n) => n.endsWith(".json"))
      .map(async (n) => {
        try {
          const file = join(dir, n);
          const a: Analysis = JSON.parse(await readFile(file, "utf8"));
          return { key: a.key ?? n.slice(0, -5), title: a.title, repo: a.repo, base: a.base, head: a.head, savedAt: (await stat(file)).mtime.toISOString() };
        } catch {
          return null;
        }
      }),
  );
  return out.filter((x): x is Saved => !!x).sort((p, q) => q.savedAt.localeCompare(p.savedAt));
}
