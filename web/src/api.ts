import type { Analysis } from "../../src/shared/analysis";
import type { DiffResult, RepoInfo } from "../../src/shared/diff";

async function get<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Error ${res.status}`);
  return body as T;
}

/** Un análisis guardado, para listarlo sin bajarlo entero */
export interface Saved {
  key: string;
  title: string;
  repo: string;
  base: string;
  head: string;
  savedAt: string;
}

export const api = {
  repo: () => get<RepoInfo>("/api/repo"),
  diff: (base: string, head: string) =>
    get<DiffResult>(`/api/diff?base=${encodeURIComponent(base)}&head=${encodeURIComponent(head)}`),
  analyses: () => get<Saved[]>("/api/analyses"),
  analysis: (key: string) => get<Analysis>(`/api/analysis/${encodeURIComponent(key)}`),
};
