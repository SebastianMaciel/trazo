import type { HunkView } from "../../../src/shared/analysis";
import { Code, useTokens } from "../highlight";
import { useReview } from "../store";

export function CodePanel() {
  const { analysis, selected, setCodeOpen } = useReview();
  const found = analysis.blocks.find((b) => b.id === selected);
  const decision = analysis.decisions.find((d) => d.id === selected);
  const block = found ?? (decision?.hunk ? { id: decision.id, title: decision.condition, file: decision.hunk.file, hunks: [decision.hunk] } : undefined);
  if (!block || !block.hunks.length) return null;

  return (
    <aside className="codepanel" key={block.id}>
      <header className="codepanel-head">
        <div>
          <div className="codepanel-title mono">{block.title}</div>
          <div className="codepanel-file mono">{block.file}</div>
        </div>
        <button className="btn btn-icon" onClick={() => setCodeOpen(false)} aria-label="Cerrar código">
          ✕
        </button>
      </header>
      <div className="codepanel-body">
        {block.hunks.map((h, i) => (
          <FullHunk key={i} hunk={h} />
        ))}
      </div>
    </aside>
  );
}

/** Partes del hunk: las que tienen nota y lo que queda entre medio */
function segments(hunk: HunkView) {
  const notes = [...(hunk.notes ?? [])].sort((a, b) => a.from - b.from);
  const out: { from: number; to: number; note?: string }[] = [];
  let i = 0;
  for (const n of notes) {
    if (n.from > i) out.push({ from: i, to: n.from - 1 });
    out.push({ from: n.from, to: n.to, note: n.text });
    i = n.to + 1;
  }
  if (i < hunk.lines.length) out.push({ from: i, to: hunk.lines.length - 1 });
  return out;
}

function FullHunk({ hunk }: { hunk: HunkView }) {
  const tokens = useTokens(hunk.file, hunk.lines.map((l) => l.text));
  const noted = !!hunk.notes?.length;
  return (
    <div className={`code ${noted ? "with-notes" : ""}`}>
      {hunk.section && <div className="code-head">{hunk.section}</div>}
      {segments(hunk).map((sg) => (
        // Cada grupo de líneas con su explicación al lado: el código se lee con la nota, no solo
        <div key={sg.from} className={`seg ${sg.note ? "has-note" : ""}`}>
          <div className="seg-code">
            {hunk.lines.slice(sg.from, sg.to + 1).map((l, k) => {
              const j = sg.from + k;
              return (
                <div key={j} className={`line ${l.kind}`}>
                  <span className="no">{l.oldNo ?? ""}</span>
                  <span className="no">{l.newNo ?? ""}</span>
                  <span className="mark">{l.kind === "add" ? "+" : l.kind === "del" ? "−" : ""}</span>
                  <Code tokens={tokens?.[j]} text={l.text} />
                </div>
              );
            })}
          </div>
          {noted && <div className="seg-note">{sg.note && <p className={/\bojo:/i.test(sg.note) ? "is-warn" : ""}>{sg.note}</p>}</div>}
        </div>
      ))}
    </div>
  );
}
