import { useEffect, useState } from "react";
import { createHighlighterCore, type HighlighterCore, type ThemedToken } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import { useCssVar } from "./theme";

/** Temas de shiki disponibles; cada tema de la app elige uno con la variable CSS --shiki */
export const SHIKI_THEMES = ["github-dark-default", "vitesse-dark", "poimandres", "kanagawa-wave", "houston", "rose-pine", "min-dark", "ayu-dark"] as const;
const FALLBACK = "github-dark-default";
let highlighter: Promise<HighlighterCore> | null = null;

function getHighlighter() {
  highlighter ??= createHighlighterCore({
    themes: [
      import("shiki/themes/github-dark-default.mjs"),
      import("shiki/themes/vitesse-dark.mjs"),
      import("shiki/themes/poimandres.mjs"),
      import("shiki/themes/kanagawa-wave.mjs"),
      import("shiki/themes/houston.mjs"),
      import("shiki/themes/rose-pine.mjs"),
      import("shiki/themes/min-dark.mjs"),
      import("shiki/themes/ayu-dark.mjs"),
    ],
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
  const wanted = useCssVar("--shiki").replace(/["']/g, "");
  const theme = (SHIKI_THEMES as readonly string[]).includes(wanted) ? wanted : FALLBACK;
  useEffect(() => {
    let alive = true;
    getHighlighter().then((h) => {
      if (alive) setTokens(h.codeToTokensBase(key, { lang: langFor(file), theme }));
    });
    return () => {
      alive = false;
    };
  }, [file, key, theme]);
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
