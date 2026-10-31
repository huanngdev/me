"use client";

import type { HighlighterCore } from "shiki/core";

const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  tsx: "tsx",
  ts: "ts",
  jsx: "jsx",
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  json: "json",
  css: "css",
  md: "markdown",
  mdx: "markdown",
  html: "html",
  sh: "bash",
  bash: "bash",
};

export function languageForPath(filePath: string): string {
  const extension = filePath.split(".").pop()?.toLowerCase() ?? "";
  return LANGUAGE_BY_EXTENSION[extension] ?? "text";
}

let highlighterPromise: Promise<HighlighterCore> | null = null;

function getHighlighter(): Promise<HighlighterCore> {
  highlighterPromise ??= (async () => {
    const [{ createHighlighterCore }, { createJavaScriptRegexEngine }] = await Promise.all([
      import("shiki/core"),
      import("shiki/engine/javascript"),
    ]);

    return createHighlighterCore({
      themes: [
        import("shiki/themes/github-light-default.mjs"),
        import("shiki/themes/github-dark-default.mjs"),
      ],
      langs: [
        import("shiki/langs/tsx.mjs"),
        import("shiki/langs/ts.mjs"),
        import("shiki/langs/jsx.mjs"),
        import("shiki/langs/javascript.mjs"),
        import("shiki/langs/json.mjs"),
        import("shiki/langs/css.mjs"),
        import("shiki/langs/markdown.mjs"),
        import("shiki/langs/html.mjs"),
        import("shiki/langs/bash.mjs"),
        import("shiki/langs/python.mjs"),
        import("shiki/langs/rust.mjs"),
        import("shiki/langs/go.mjs"),
      ],
      engine: createJavaScriptRegexEngine(),
    });
  })();

  return highlighterPromise;
}

export async function highlightCode(code: string, language: string): Promise<string> {
  const highlighter = await getHighlighter();
  const loaded = highlighter.getLoadedLanguages();

  if (!loaded.includes(language)) {
    return `<pre class="shiki"><code>${escapeHtml(code)}</code></pre>`;
  }

  return highlighter.codeToHtml(code, {
    lang: language,
    themes: { light: "github-light-default", dark: "github-dark-default" },
    defaultColor: false,
  });
}

function escapeHtml(code: string): string {
  return code
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
