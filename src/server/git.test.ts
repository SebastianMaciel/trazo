import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDiff, getRevDiff, repoInfo } from "./git.js";

let dir: string;
const g = (...args: string[]) => execFileSync("git", args, { cwd: dir, stdio: "pipe" }).toString();

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "trazo-git-"));
  g("init", "-q", "-b", "main");
  g("config", "user.email", "test@example.com");
  g("config", "user.name", "Test");
  writeFileSync(join(dir, "a.ts"), "export const a = 1;\n");
  g("add", ".");
  g("commit", "-qm", "base");
  g("checkout", "-qb", "fix/a");
  writeFileSync(join(dir, "a.ts"), "export const a = 2;\n");
  g("commit", "-qam", "fix");
  // main avanza después de abrir la rama: no tiene que aparecer en el diff
  g("checkout", "-q", "main");
  writeFileSync(join(dir, "b.ts"), "export const b = 1;\n");
  g("add", ".");
  g("commit", "-qm", "otro cambio en main");
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("git", () => {
  it("lista ramas y elige main como base", async () => {
    const info = await repoInfo(dir);
    expect(info.defaultBase).toBe("main");
    expect(info.branches.map((b) => b.name).sort()).toEqual(["fix/a", "main"]);
  });

  it("compara desde el merge-base, como un PR", async () => {
    const d = await getDiff(dir, "main", "fix/a");
    expect(d.files.map((f) => f.newPath)).toEqual(["a.ts"]);
    expect(d.mergeBase).not.toBe(d.base.sha);
  });

  it("con cualquier par de commits también compara desde el merge-base", async () => {
    const d = await getRevDiff(dir, "main", g("rev-parse", "fix/a").trim());
    expect(d.files.map((f) => f.newPath)).toEqual(["a.ts"]);
  });

  it("no deja pasar opciones de git disfrazadas de commit", async () => {
    await expect(getRevDiff(dir, "main", "--output=/tmp/x")).rejects.toThrow(/no es un commit válido/);
    await expect(getRevDiff(dir, "main", "no-existe")).rejects.toThrow(/No existe/);
  });

  it("rechaza ramas que no existen", async () => {
    await expect(getDiff(dir, "main", "--output=/tmp/x")).rejects.toThrow(/No existe la rama/);
  });
});
