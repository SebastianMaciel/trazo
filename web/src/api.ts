import type { DiffResult, RepoInfo } from "../../src/shared/diff";

async function get<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? `Error ${res.status}`);
  return body as T;
}

export const api = {
  repo: () => get<RepoInfo>("/api/repo"),
  diff: (base: string, head: string) =>
    get<DiffResult>(`/api/diff?base=${encodeURIComponent(base)}&head=${encodeURIComponent(head)}`),
};
