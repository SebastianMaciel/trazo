import type { HunkView } from "../../../src/shared/analysis";
import { Code, useTokens } from "../highlight";
import { useReview } from "../store";

export function CodePanel() {
  const { analysis, selected, setCodeOpen } = useReview();
  const block = analysis.blocks.find((b) => b.id === selected);
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

function FullHunk({ hunk }: { hunk: HunkView }) {
  const tokens = useTokens(hunk.file, hunk.lines.map((l) => l.text));
  return (
    <div className="code">
      {hunk.section && <div className="code-head">{hunk.section}</div>}
      {hunk.lines.map((l, j) => (
        <div key={j} className={`line ${l.kind}`}>
          <span className="no">{l.oldNo ?? ""}</span>
          <span className="no">{l.newNo ?? ""}</span>
          <span className="mark">{l.kind === "add" ? "+" : l.kind === "del" ? "−" : ""}</span>
          <Code tokens={tokens?.[j]} text={l.text} />
        </div>
      ))}
    </div>
  );
}
