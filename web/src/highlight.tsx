import { useEffect, useState } from "react";
import { createHighlighterCore, type HighlighterCore, type ThemedToken } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";

const THEME = "github-dark-default";
let highlighter: Promise<HighlighterCore> | null = null;

function getHighlighter() {
  highlighter ??= createHighlighterCore({
    themes: [import("shiki/themes/github-dark-default.mjs")],
    langs: [import("shiki/langs/typescript.mjs"), import("shiki/langs/tsx.mjs")],
    engine: createJavaScriptRegexEngine(),
  });
  return highlighter;
}

const langFor = (file: string) => (file.endsWith(".tsx") || file.endsWith(".jsx") ? "tsx" : "typescript");

/**
 * Tokens por línea. Se tokeniza el bloque entero (y no línea por línea) para que
 * strings y comentarios de varias líneas se coloreen bien.
 */
export function useTokens(file: string, lines: string[]): ThemedToken[][] | null {
  const [tokens, setTokens] = useState<ThemedToken[][] | null>(null);
  const key = lines.join("\n");
  useEffect(() => {
    let alive = true;
    getHighlighter().then((h) => {
      if (alive) setTokens(h.codeToTokensBase(key, { lang: langFor(file), theme: THEME }));
    });
    return () => {
      alive = false;
    };
  }, [file, key]);
  return tokens;
}

export function Code({ tokens, text }: { tokens: ThemedToken[] | undefined; text: string }) {
  if (!tokens) return <code>{text}</code>;
  return (
    <code>
      {tokens.map((t, i) => (
        <span key={i} style={{ color: t.color }}>
          {t.content}
        </span>
      ))}
    </code>
  );
}
