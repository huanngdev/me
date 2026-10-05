import { readFileSync } from "node:fs";
import path from "node:path";

import { NotionLikeEditorBlock } from "@repo/core/components/blocks/notion-like-editor/notion-like-editor-block";
import { BlockPreviewFrame } from "@repo/core/components/layouts/block-preview-frame";
import type { Metadata } from "next";

import { readLlmsDocument } from "@/lib/read-llms-document";

const REPO_ROOT = process.cwd().endsWith("apps/web")
  ? path.resolve(process.cwd(), "../..")
  : process.cwd();

function readSource(relativePath: string): string {
  return readFileSync(path.join(REPO_ROOT, relativePath), "utf8");
}

const BLOCK_DIR = "packages/core/src/components/blocks/notion-like-editor";
const ROUTE_DIR = "apps/web/src/app/blocks/notion-like-editor";

const BLOCK_FILES = [
  {
    path: "components/blocks/notion-like-editor/editor-value.ts",
    code: readSource(`${BLOCK_DIR}/editor-value.ts`),
  },
  {
    path: "components/blocks/notion-like-editor/editor-plugins.ts",
    code: readSource(`${BLOCK_DIR}/editor-plugins.ts`),
  },
  {
    path: "components/blocks/notion-like-editor/use-notion-like-editor.ts",
    code: readSource(`${BLOCK_DIR}/use-notion-like-editor.ts`),
  },
  {
    path: "components/blocks/notion-like-editor/notion-like-editor-block.tsx",
    code: readSource(`${BLOCK_DIR}/notion-like-editor-block.tsx`),
  },
  {
    path: "app/blocks/notion-like-editor/page.tsx",
    code: readSource(`${ROUTE_DIR}/page.tsx`),
  },
];

const description = "A Notion-style block editor built on Plate with shadcn primitives.";

export const metadata: Metadata = {
  title: "Notion-like Editor Block",
  description,
  alternates: { canonical: "/blocks/notion-like-editor" },
  openGraph: {
    title: "Notion-like Editor Block",
    description,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Notion-like Editor Block",
    description,
  },
};

export default function NotionLikeEditorBlockPage() {
  return (
    <BlockPreviewFrame
      name="notion-like-editor"
      url="huanngdev.site/blocks/notion-like-editor"
      files={BLOCK_FILES}
      llmText={readLlmsDocument("blocks", "notion-like-editor")}
      backButton={{ label: "Go back", position: "top-left" }}
    >
      <NotionLikeEditorBlock documentId="demo" />
    </BlockPreviewFrame>
  );
}
