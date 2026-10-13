import { cn } from "@repo/core/lib/utils";
import { NotionLikeEditorDemo } from "@repo/core/components/blocks/notion-like-editor/notion-like-editor-demo";

import { CONTENT_SHELL_CLASS, EDITOR_WIDTH_STYLE } from "@/lib/layout";

export default function Home() {
  return (
    <div
      className={cn("flex min-h-0 flex-1 flex-col", CONTENT_SHELL_CLASS)}
      style={EDITOR_WIDTH_STYLE}
    >
      {/* The editor root adds px-4 of its own (@repo/core). The negative margin cancels it, so the text lines up with the header. */}
      <div className="-mx-4 flex min-h-0 flex-1 flex-col">
        <NotionLikeEditorDemo />
      </div>
    </div>
  );
}
