import type { ReactNode } from "react";

import { PUBLIC_PORTFOLIO_URL } from "../../constants";
import { type FixedBackButtonProps } from "../fixed-back-button";
import { BlockPreviewTabs } from "./block-preview-tabs";
import { BlockUrlProvider, SafariPreview } from "./block-url";
import { highlightFiles, highlightLlm, type BlockFile } from "./highlight-source";

export type { BlockFile } from "./highlight-source";

const DEFAULT_PREVIEW_URL = PUBLIC_PORTFOLIO_URL.replace(/^https?:\/\//, "");

export type BlockPreviewFrameProps = {
  children: ReactNode;
  url?: string;
  name?: string;
  backButton?: FixedBackButtonProps | false;
  files?: readonly BlockFile[];
  llmText?: string;
  install?: ReactNode;
  docs?: ReactNode;
};

export async function BlockPreviewFrame({
  children,
  url = DEFAULT_PREVIEW_URL,
  name = "block",
  backButton,
  files,
  llmText,
  install,
  docs,
}: BlockPreviewFrameProps) {
  const explorerFiles = await highlightFiles(files ?? []);
  const llm = await highlightLlm(llmText);

  const preview = (
    <div className="flex flex-col items-center gap-3">
      <SafariPreview baseUrl={url} className="w-[min(92vw,130vh)] drop-shadow-xl">
        <div data-block-viewport className="bg-background size-full overflow-auto">
          {children}
        </div>
      </SafariPreview>
    </div>
  );

  return (
    <div
      data-fullscreen-block
      className="bg-secondary/30 relative isolate h-dvh min-h-0 w-full overflow-hidden"
    >
      <BlockUrlProvider>
        <BlockPreviewTabs
          preview={preview}
          files={explorerFiles}
          rootName={name}
          url={url}
          backButton={backButton}
          llm={llm}
          install={install}
          docs={docs}
        />
      </BlockUrlProvider>
    </div>
  );
}
