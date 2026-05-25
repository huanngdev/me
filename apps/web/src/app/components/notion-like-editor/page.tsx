import type { Metadata } from "next";

import { NotionLikeEditor } from "@repo/core/components/notion-like-editor";
import { PageHeader } from "@repo/core/components/layouts/page-header";

export const metadata: Metadata = {
  title: "Notion-like Editor",
  description: "A block-based rich text editor inspired by Notion.",
  alternates: { canonical: "/components/notion-like-editor" },
  openGraph: {
    title: "Notion-like Editor",
    description: "A block-based rich text editor inspired by Notion.",
    type: "website",
  },
};

export default function NotionLikeEditorPage() {
  return (
    <>
      <PageHeader title="Notion-like Editor" />
      <article className="mx-auto flex w-full max-w-4xl flex-1 flex-col border-x">
        <div className="flex-1 px-4 py-8 sm:px-6 lg:px-8">
          <NotionLikeEditor />
        </div>
      </article>
    </>
  );
}
