"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";

import { Button } from "./button";
import { CopyButton } from "./copy-button";
import { cn } from "../lib/utils";

export type CodeBlockShellProps = {
  code: string;
  language: string;
  html: string;
  lineCount: number;
  maxLines: number;
  showLanguage: boolean;
  className?: string;
};

const LINE_HEIGHT_PX = 20;
const PADDING_Y_PX = 32;

export function CodeBlockShell({
  code,
  language,
  html,
  lineCount,
  maxLines,
  showLanguage,
  className,
}: CodeBlockShellProps) {
  const isCollapsible = lineCount > maxLines;
  const [expanded, setExpanded] = React.useState(false);
  const collapsed = isCollapsible && !expanded;
  const collapsedHeight = maxLines * LINE_HEIGHT_PX + PADDING_Y_PX;

  return (
    <div
      data-slot="code-block"
      className={cn("bg-muted/40 group relative overflow-hidden rounded-lg border", className)}
    >
      <div className="absolute top-2 right-2 z-10 flex items-center gap-1">
        {showLanguage && (
          <span className="text-muted-foreground bg-background/80 rounded-md px-1.5 py-0.5 font-mono text-[10px] tracking-wide uppercase opacity-0 transition-opacity group-hover:opacity-100">
            {language}
          </span>
        )}
        <CopyButton
          text={code}
          size="icon-sm"
          className="opacity-0 transition-opacity group-hover:opacity-100"
        />
      </div>
      <div
        style={collapsed ? { maxHeight: collapsedHeight } : undefined}
        className={cn("overflow-auto", collapsed && "overflow-hidden")}
      >
        <div
          className="code-block-shiki text-xs leading-[20px] [&_pre]:!bg-transparent [&_pre]:p-4"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
      {collapsed && (
        <div
          aria-hidden
          className="from-muted/40 pointer-events-none absolute right-0 bottom-10 left-0 h-16 bg-gradient-to-t to-transparent"
        />
      )}
      {isCollapsible && (
        <div className="border-t">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setExpanded((v) => !v)}
            className="w-full rounded-none"
          >
            <ChevronDown className={cn("transition-transform", expanded && "rotate-180")} />
            {expanded ? "Collapse" : `Expand (${lineCount} lines)`}
          </Button>
        </div>
      )}
    </div>
  );
}
