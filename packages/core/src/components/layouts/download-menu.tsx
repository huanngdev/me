"use client";

import { ChevronsUpDown, Download } from "lucide-react";

import { buildProfileJson, buildProfileMarkdown, downloadBlob } from "../../lib/profile-export";
import { Button } from "../button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../dropdown-menu";

const FILENAME = "ngo-gia-huan";
const CV_PDF_PATH = "/huanngdev_cv.pdf";

export function DownloadMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" aria-label="Download profile">
          <Download className="size-4" />
          Download
          <ChevronsUpDown className="ml-1 size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        <DropdownMenuItem asChild>
          <a href={CV_PDF_PATH} download={`${FILENAME}-cv.pdf`}>
            PDF (CV)
            <span className="text-muted-foreground ml-auto font-mono text-xs">.pdf</span>
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() =>
            downloadBlob(`${FILENAME}.md`, buildProfileMarkdown(), "text/markdown;charset=utf-8")
          }
        >
          Markdown
          <span className="text-muted-foreground ml-auto font-mono text-xs">.md</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() =>
            downloadBlob(`${FILENAME}.json`, buildProfileJson(), "application/json;charset=utf-8")
          }
        >
          JSON
          <span className="text-muted-foreground ml-auto font-mono text-xs">.json</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
