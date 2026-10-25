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

  const mergeBase = (await git(root, ["merge-base", b.sha, h.sha])).trim();
  const raw = await git(root, ["diff", "--no-color", "--no-ext-diff", "-M", "--unified=3", mergeBase, h.sha]);
  return {
    base: { ref: base, sha: b.sha },
    head: { ref: head, sha: h.sha },
    mergeBase,
    files: parseDiff(raw),
  };
}
