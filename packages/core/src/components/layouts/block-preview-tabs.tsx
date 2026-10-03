"use client";

import type { ReactNode } from "react";
import { Code2, Eye, FileText } from "lucide-react";

import { CopyButton } from "../copy-button";
import { FixedBackButton, type FixedBackButtonProps } from "../fixed-back-button";
import { Safari } from "../safari";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../tabs";
import { ThemeToggle } from "../theme-toggle";
import { BlockFileExplorer, type BlockExplorerFile } from "./block-file-explorer";

type BlockLlmDocument = {
  code: string;
  html: string;
};

type BlockPreviewTabsProps = {
  preview: ReactNode;
  files: readonly BlockExplorerFile[];
  rootName: string;
  url: string;
  backButton?: FixedBackButtonProps | false;
  llm?: BlockLlmDocument;
};

export function BlockPreviewTabs({
  preview,
  files,
  rootName,
  url,
  backButton,
  llm,
}: BlockPreviewTabsProps) {
  return (
    <Tabs defaultValue="preview" className="h-full min-h-0 gap-0">
      <div className="fixed top-4 left-4 z-30 flex items-center gap-2">
        {backButton !== false && <FixedBackButton {...backButton} className="static" />}
        <ThemeToggle />
        <TabsList className="bg-background/80 border backdrop-blur">
          <TabsTrigger value="preview">
            <Eye />
            Preview
          </TabsTrigger>
          <TabsTrigger value="code">
            <Code2 />
            Code
          </TabsTrigger>
          {llm ? (
            <TabsTrigger value="llm">
              <FileText />
              llm.txt
            </TabsTrigger>
          ) : null}
        </TabsList>
      </div>

      <TabsContent
        value="preview"
        className="flex min-h-0 flex-1 items-center justify-center px-4 pt-16 pb-6"
      >
        {preview}
      </TabsContent>

      <TabsContent
        value="code"
        className="flex min-h-0 flex-1 items-center justify-center px-4 pt-16 pb-6"
      >
        <Safari url={url} className="w-[min(92vw,130vh)] drop-shadow-xl">
          {files.length > 0 ? (
            <BlockFileExplorer files={files} rootName={rootName} />
          ) : (
            <div className="text-muted-foreground flex h-full items-center justify-center text-sm">
              No source files available for this block.
            </div>
          )}
        </Safari>
      </TabsContent>

      {llm ? (
        <TabsContent
          value="llm"
          className="flex min-h-0 flex-1 items-center justify-center px-4 pt-16 pb-6"
        >
          <Safari url={url} className="w-[min(92vw,130vh)] drop-shadow-xl">
            <div className="bg-background flex size-full min-h-0 flex-col">
              <header className="flex h-9 shrink-0 items-center justify-between gap-2 border-b px-3">
                <span className="text-muted-foreground truncate font-mono text-xs">llm.txt</span>
                <CopyButton text={llm.code} size="icon-sm" />
              </header>
              <div
                className="code-block-shiki min-h-0 flex-1 overflow-auto text-xs leading-[20px] [&_pre]:!bg-transparent [&_pre]:p-4"
                dangerouslySetInnerHTML={{ __html: llm.html }}
              />
            </div>
          </Safari>
        </TabsContent>
      ) : null}
    </Tabs>
  );
}
