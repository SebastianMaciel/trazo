import { useEffect, useState } from "react";
import { filePath, type DiffResult, type RepoInfo } from "../../src/shared/diff";
import { api } from "./api";

export function App() {
  const [repo, setRepo] = useState<RepoInfo | null>(null);
  const [base, setBase] = useState("");
  const [head, setHead] = useState("");
  const [diff, setDiff] = useState<DiffResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api
      .repo()
      .then((r) => {
        setRepo(r);
        setBase(r.defaultBase);
        setHead(r.branches.find((b) => b.name !== r.defaultBase)?.name ?? "");
      })
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!base || !head) return;
    setLoading(true);
    setError(null);
    api
      .diff(base, head)
      .then(setDiff)
      .catch((e) => {
        setDiff(null);
        setError(e.message);
      })
      .finally(() => setLoading(false));
  }, [base, head]);

  const totals = diff?.files.reduce((t, f) => ({ add: t.add + f.additions, del: t.del + f.deletions }), { add: 0, del: 0 });

  return (
    <div className="app">
      <header className="bar">
        <span className="logo">trazo</span>
        <span className="repo">{repo?.name}</span>
        {repo && (
          <div className="pick">
            <BranchSelect label="base" value={base} onChange={setBase} repo={repo} />
            <span className="arrow">←</span>
            <BranchSelect label="cambios" value={head} onChange={setHead} repo={repo} exclude={base} />
          </div>
        )}
        {totals && (
          <span className="totals">
            {diff!.files.length} archivos · <span className="add">+{totals.add}</span> <span className="del">−{totals.del}</span>
          </span>
        )}
      </header>

      <main className="body">
        {error && <div className="notice error">{error}</div>}
        {loading && <div className="notice">Leyendo el diff…</div>}
        {diff && !loading && diff.files.length === 0 && <div className="notice">Sin cambios entre estas ramas.</div>}
        {diff?.files.map((f) => (
          <section key={filePath(f)} className="file">
            <h2>
              <span className={`status ${f.status}`}>{STATUS[f.status]}</span>
              {f.status === "renamed" ? `${f.oldPath} → ${f.newPath}` : filePath(f)}
              <span className="counts">
                <span className="add">+{f.additions}</span> <span className="del">−{f.deletions}</span>
              </span>
            </h2>
            {f.binary && <p className="muted">Archivo binario</p>}
            {f.hunks.map((h) => (
              <div key={h.id} className="hunk">
                {h.section && <div className="section">{h.section}</div>}
                {h.lines.map((l, i) => (
                  <div key={i} className={`line ${l.kind}`}>
                    <span className="no">{l.oldNo ?? ""}</span>
                    <span className="no">{l.newNo ?? ""}</span>
                    <span className="mark">{l.kind === "add" ? "+" : l.kind === "del" ? "−" : ""}</span>
                    <code>{l.text}</code>
                  </div>
                ))}
              </div>
            ))}
          </section>
        ))}
      </main>
    </div>
  );
}

const STATUS = { added: "nuevo", deleted: "borrado", modified: "modificado", renamed: "renombrado" } as const;

function BranchSelect(props: { label: string; value: string; onChange: (v: string) => void; repo: RepoInfo; exclude?: string }) {
  return (
    <label className="branch">
      <span>{props.label}</span>
      <select value={props.value} onChange={(e) => props.onChange(e.target.value)}>
        {props.repo.branches
          .filter((b) => b.name !== props.exclude)
          .map((b) => (
            <option key={b.name} value={b.name}>
              {b.name}
              {b.worktree ? "  (worktree)" : ""}
            </option>
          ))}
      </select>
    </label>
  );
}
