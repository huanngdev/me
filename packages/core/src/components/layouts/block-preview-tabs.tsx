"use client";

import type { ReactNode } from "react";
import { Code2, Eye } from "lucide-react";

import { FixedBackButton, type FixedBackButtonProps } from "../fixed-back-button";
import { Safari } from "../safari";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../tabs";
import { ThemeToggle } from "../theme-toggle";
import { BlockFileExplorer, type BlockExplorerFile } from "./block-file-explorer";

type BlockPreviewTabsProps = {
  preview: ReactNode;
  files: readonly BlockExplorerFile[];
  rootName: string;
  url: string;
  backButton?: FixedBackButtonProps | false;
};

export function BlockPreviewTabs({
  preview,
  files,
  rootName,
  url,
  backButton,
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
    </Tabs>
  );
}
