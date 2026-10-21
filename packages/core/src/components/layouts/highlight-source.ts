import { codeToHtml, type BundledLanguage } from "shiki";

import type { BlockExplorerFile } from "./block-file-explorer";

const LANGUAGE_BY_EXTENSION: Record<string, BundledLanguage> = {
  tsx: "tsx",
  ts: "ts",
  jsx: "jsx",
  js: "js",
  json: "json",
  css: "css",
  md: "markdown",
  html: "html",
  bash: "bash",
};

export type BlockFile = {
  path: string;
  code: string;
};

export async function highlightFiles(files: readonly BlockFile[]): Promise<BlockExplorerFile[]> {
  return Promise.all(
    files.map(async (file) => {
      const language = languageForPath(file.path);
      const html = await codeToHtml(file.code, {
        lang: language,
        themes: { light: "github-light-default", dark: "github-dark-default" },
        defaultColor: false,
      });

      return {
        path: file.path,
        name: file.path.split("/").pop() ?? file.path,
        language,
        html,
        code: file.code,
      };
    }),
  );
}

function languageForPath(filePath: string): BundledLanguage {
  const extension = filePath.split(".").pop()?.toLowerCase() ?? "";
  return LANGUAGE_BY_EXTENSION[extension] ?? "text";
}
