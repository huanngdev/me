import type { ReactNode } from "react";
import { codeToHtml, type BundledLanguage } from "shiki";

import { PUBLIC_PORTFOLIO_URL } from "../../constants";
import { type FixedBackButtonProps } from "../fixed-back-button";
import { Safari } from "../safari";
import { StripedPattern } from "../striped-pattern";
import type { BlockExplorerFile } from "./block-file-explorer";
import { BlockPreviewTabs } from "./block-preview-tabs";

const DEFAULT_PREVIEW_URL = PUBLIC_PORTFOLIO_URL.replace(/^https?:\/\//, "");

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

export type BlockPreviewFrameProps = {
  children: ReactNode;
  url?: string;
  name?: string;
  backButton?: FixedBackButtonProps | false;
  files?: readonly BlockFile[];
};

export async function BlockPreviewFrame({
  children,
  url = DEFAULT_PREVIEW_URL,
  name = "block",
  backButton,
  files,
}: BlockPreviewFrameProps) {
  const explorerFiles: BlockExplorerFile[] = await Promise.all(
    (files ?? []).map(async (file) => {
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

  const preview = (
    <div className="flex flex-col items-center gap-3">
      <Safari url={url} className="w-[min(92vw,130vh)] drop-shadow-xl">
        <div data-block-viewport className="bg-background size-full overflow-auto">
          {children}
        </div>
      </Safari>
    </div>
  );

  return (
    <div data-fullscreen-block className="relative isolate h-dvh min-h-0 w-full overflow-hidden">
      <StripedPattern className="-z-10" />
      <BlockPreviewTabs
        preview={preview}
        files={explorerFiles}
        rootName={name}
        url={url}
        backButton={backButton}
      />
    </div>
  );
}

function languageForPath(filePath: string): BundledLanguage {
  const extension = filePath.split(".").pop()?.toLowerCase() ?? "";
  return LANGUAGE_BY_EXTENSION[extension] ?? "text";
}
