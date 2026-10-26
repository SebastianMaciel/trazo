import { execFile } from "node:child_process";
import { basename } from "node:path";
import { promisify } from "node:util";
import type { Branch, DiffResult, RepoInfo } from "../shared/diff.js";
import { parseDiff } from "./parse-diff.js";

const exec = promisify(execFile);

export class GitError extends Error {}

async function git(cwd: string, args: string[]): Promise<string> {
  try {
    const { stdout } = await exec("git", ["-c", "core.quotePath=false", ...args], { cwd, maxBuffer: 64 * 1024 * 1024 });
    return stdout;
  } catch (e) {
    const err = e as { stderr?: string; message: string };
    throw new GitError((err.stderr || err.message).trim());
  }
}

export async function repoRoot(cwd: string): Promise<string> {
  return (await git(cwd, ["rev-parse", "--show-toplevel"])).trim();
}

export async function listBranches(root: string): Promise<Branch[]> {
  const out = await git(root, [
    "for-each-ref",
    "--sort=-committerdate",
    "--format=%(refname:short)%00%(objectname)%00%(HEAD)%00%(worktreepath)",
    "refs/heads",
  ]);
  return out
    .split("\n")
    .filter(Boolean)
    .map((row) => {
      const [name, sha, head, wt] = row.split("\0");
      return { name, sha, current: head === "*", worktree: wt && wt !== root ? wt : null };
    });
}

export async function repoInfo(root: string): Promise<RepoInfo> {
  const branches = await listBranches(root);
  const names = branches.map((b) => b.name);
  const defaultBase = ["main", "master", "develop"].find((n) => names.includes(n)) ?? branches.find((b) => b.current)?.name ?? names[0];
  return { root, name: basename(root), defaultBase, branches };
}

/** Diff estilo PR: desde el merge-base de base y head hasta head */
export async function getDiff(root: string, base: string, head: string): Promise<DiffResult> {
  const branches = await listBranches(root);
  const byName = new Map(branches.map((b) => [b.name, b]));
  const b = byName.get(base);
  const h = byName.get(head);
  if (!b) throw new GitError(`No existe la rama "${base}"`);
  if (!h) throw new GitError(`No existe la rama "${head}"`);
  return diffShas(root, { ref: base, sha: b.sha }, { ref: head, sha: h.sha });
}

/** Un commit a partir de cualquier cosa que entienda git: rama, origin/develop, FETCH_HEAD, sha */
export async function resolveRev(root: string, rev: string): Promise<string> {
  // Nada que empiece con "-": git lo tomaría como una opción
  if (!rev || rev.startsWith("-")) throw new GitError(`"${rev}" no es un commit válido`);
  try {
    return (await git(root, ["rev-parse", "--verify", "--quiet", "--end-of-options", `${rev}^{commit}`])).trim();
  } catch {
    throw new GitError(`No existe "${rev}" en ${root}. Si es un MR, primero hay que bajarlo con git fetch`);
  }
}

/** Como getDiff, pero con cualquier par de commits (lo usa el agente para un MR) */
export async function getRevDiff(root: string, base: string, head: string): Promise<DiffResult> {
  const [b, h] = await Promise.all([resolveRev(root, base), resolveRev(root, head)]);
  return diffShas(root, { ref: base, sha: b }, { ref: head, sha: h });
}

async function diffShas(root: string, base: { ref: string; sha: string }, head: { ref: string; sha: string }): Promise<DiffResult> {
  const mergeBase = (await git(root, ["merge-base", base.sha, head.sha])).trim();
  const raw = await git(root, ["diff", "--no-color", "--no-ext-diff", "-M", "--unified=3", mergeBase, head.sha]);
  return { base, head, mergeBase, files: parseDiff(raw) };
}

/** El contenido de un archivo en un commit, o null si ahí no existe */
export async function fileAt(root: string, sha: string, path: string): Promise<string | null> {
  try {
    return await git(root, ["show", `${sha}:${path}`]);
  } catch {
    return null;
  }
}
