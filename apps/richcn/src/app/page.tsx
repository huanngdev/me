import { NotionLikeEditorDemo } from "@repo/core/components/blocks/notion-like-editor/notion-like-editor-demo";
import { cn } from "@repo/core/lib/utils";
import type { Metadata } from "next";

import { JsonLd } from "@/components/json-ld";
import { CONTENT_SHELL_CLASS, EDITOR_WIDTH_STYLE } from "@/lib/layout";
import { softwareApplicationJsonLd } from "@/lib/json-ld";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  // `absolute` opts out of the layout's `%s — richcn` template, so the brand cannot be added twice.
  title: { absolute: SITE.title },
  description: SITE.description,
  alternates: { canonical: "/" },
};

export default function Home() {
  return (
    <div
      className={cn("flex min-h-0 flex-1 flex-col", CONTENT_SHELL_CLASS)}
      style={EDITOR_WIDTH_STYLE}
    >
      {/* The page heading, for a search engine and a screen reader. The demo below is the visible
          content; this element is clipped, so the layout is unchanged. */}
      <h1 className="sr-only">{SITE.tagline}</h1>
      {/* The editor root adds px-4 of its own (@repo/core). The negative margin cancels it, so the text lines up with the header. */}
      <div className="-mx-4 flex min-h-0 flex-1 flex-col">
        <NotionLikeEditorDemo />
      </div>
      <JsonLd data={softwareApplicationJsonLd()} />
    </div>
  );
}
