import type { ReactNode } from "react";

import { cn } from "../../lib/utils";
import { PUBLIC_PORTFOLIO_URL } from "../../constants";
import { BlockPreviewFrame, type BlockFile } from "./block-preview-frame";

const PREVIEW_HOST = PUBLIC_PORTFOLIO_URL.replace(/^https?:\/\//, "");

export type ComponentPreviewFrameProps = {
  children: ReactNode;
  name: string;
  files: readonly BlockFile[];
  llmText?: string;
  docs: ReactNode;
  previewClassName?: string;
};

export function ComponentPreviewFrame({
  children,
  name,
  files,
  llmText,
  docs,
  previewClassName,
}: ComponentPreviewFrameProps) {
  return (
    <BlockPreviewFrame
      name={name}
      url={`${PREVIEW_HOST}/components/${name}`}
      files={files}
      llmText={llmText}
      docs={docs}
      backButton={{ label: "Go back", position: "top-left" }}
    >
      <div className="flex min-h-full items-center justify-center p-6 sm:p-10">
        <div className={cn("w-full max-w-md", previewClassName)}>{children}</div>
      </div>
    </BlockPreviewFrame>
  );
}
