import { readFileSync } from "node:fs";
import path from "node:path";

import { NotionLikeEditorDemo } from "@repo/core/components/blocks/notion-like-editor/notion-like-editor-demo";
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
    path: "components/blocks/notion-like-editor/editor-document-schema.ts",
    code: readSource(`${BLOCK_DIR}/editor-document-schema.ts`),
  },
  {
    path: "components/blocks/notion-like-editor/editor-document.ts",
    code: readSource(`${BLOCK_DIR}/editor-document.ts`),
  },
  {
    path: "components/blocks/notion-like-editor/editor-document-ids.ts",
    code: readSource(`${BLOCK_DIR}/editor-document-ids.ts`),
  },
  {
    path: "components/blocks/notion-like-editor/editor-document-migrate.ts",
    code: readSource(`${BLOCK_DIR}/editor-document-migrate.ts`),
  },
  {
    path: "components/blocks/notion-like-editor/editor-document-validate.ts",
    code: readSource(`${BLOCK_DIR}/editor-document-validate.ts`),
  },
  {
    path: "components/blocks/notion-like-editor/editor-paste.ts",
    code: readSource(`${BLOCK_DIR}/editor-paste.ts`),
  },
  {
    path: "components/blocks/notion-like-editor/editor-paste-repairs.ts",
    code: readSource(`${BLOCK_DIR}/editor-paste-repairs.ts`),
  },
  {
    path: "components/blocks/notion-like-editor/editor-plugins.ts",
    code: readSource(`${BLOCK_DIR}/editor-plugins.ts`),
  },
  {
    path: "components/blocks/notion-like-editor/editor-toggle.ts",
    code: readSource(`${BLOCK_DIR}/editor-toggle.ts`),
  },
  {
    path: "components/blocks/notion-like-editor/heading-element.tsx",
    code: readSource(`${BLOCK_DIR}/heading-element.tsx`),
  },
  {
    path: "components/blocks/notion-like-editor/block-list.tsx",
    code: readSource(`${BLOCK_DIR}/block-list.tsx`),
  },
  {
    path: "components/blocks/notion-like-editor/blockquote-element.tsx",
    code: readSource(`${BLOCK_DIR}/blockquote-element.tsx`),
  },
  {
    path: "components/blocks/notion-like-editor/callout-element.tsx",
    code: readSource(`${BLOCK_DIR}/callout-element.tsx`),
  },
  {
    path: "components/blocks/notion-like-editor/editor-code.ts",
    code: readSource(`${BLOCK_DIR}/editor-code.ts`),
  },
  {
    path: "components/blocks/notion-like-editor/code-block-element.tsx",
    code: readSource(`${BLOCK_DIR}/code-block-element.tsx`),
  },
  {
    path: "components/blocks/notion-like-editor/editor-table.ts",
    code: readSource(`${BLOCK_DIR}/editor-table.ts`),
  },
  {
    path: "components/blocks/notion-like-editor/editor-table-grid.ts",
    code: readSource(`${BLOCK_DIR}/editor-table-grid.ts`),
  },
  {
    path: "components/blocks/notion-like-editor/editor-table-commands.ts",
    code: readSource(`${BLOCK_DIR}/editor-table-commands.ts`),
  },
  {
    path: "components/blocks/notion-like-editor/table-element.tsx",
    code: readSource(`${BLOCK_DIR}/table-element.tsx`),
  },
  {
    path: "components/blocks/notion-like-editor/table-controls.tsx",
    code: readSource(`${BLOCK_DIR}/table-controls.tsx`),
  },
  {
    path: "components/blocks/notion-like-editor/toggle-element.tsx",
    code: readSource(`${BLOCK_DIR}/toggle-element.tsx`),
  },
  {
    path: "components/blocks/notion-like-editor/hr-element.tsx",
    code: readSource(`${BLOCK_DIR}/hr-element.tsx`),
  },
  {
    path: "components/blocks/notion-like-editor/editor-media.ts",
    code: readSource(`${BLOCK_DIR}/editor-media.ts`),
  },
  {
    path: "components/blocks/notion-like-editor/media-element-parts.tsx",
    code: readSource(`${BLOCK_DIR}/media-element-parts.tsx`),
  },
  {
    path: "components/blocks/notion-like-editor/editor-image.ts",
    code: readSource(`${BLOCK_DIR}/editor-image.ts`),
  },
  {
    path: "components/blocks/notion-like-editor/image-element.tsx",
    code: readSource(`${BLOCK_DIR}/image-element.tsx`),
  },
  {
    path: "components/blocks/notion-like-editor/editor-video.ts",
    code: readSource(`${BLOCK_DIR}/editor-video.ts`),
  },
  {
    path: "components/blocks/notion-like-editor/video-element.tsx",
    code: readSource(`${BLOCK_DIR}/video-element.tsx`),
  },
  {
    path: "components/blocks/notion-like-editor/editor-audio.ts",
    code: readSource(`${BLOCK_DIR}/editor-audio.ts`),
  },
  {
    path: "components/blocks/notion-like-editor/audio-element.tsx",
    code: readSource(`${BLOCK_DIR}/audio-element.tsx`),
  },
  {
    path: "components/blocks/notion-like-editor/editor-selection.ts",
    code: readSource(`${BLOCK_DIR}/editor-selection.ts`),
  },
  {
    path: "components/blocks/notion-like-editor/editor-commands.ts",
    code: readSource(`${BLOCK_DIR}/editor-commands.ts`),
  },
  {
    path: "components/blocks/notion-like-editor/editor-assets.ts",
    code: readSource(`${BLOCK_DIR}/editor-assets.ts`),
  },
  {
    path: "components/blocks/notion-like-editor/asset-validation.ts",
    code: readSource(`${BLOCK_DIR}/asset-validation.ts`),
  },
  {
    path: "components/blocks/notion-like-editor/upload-controller.ts",
    code: readSource(`${BLOCK_DIR}/upload-controller.ts`),
  },
  {
    path: "components/blocks/notion-like-editor/asset-references.ts",
    code: readSource(`${BLOCK_DIR}/asset-references.ts`),
  },
  {
    path: "components/blocks/notion-like-editor/indexed-db-asset-store.ts",
    code: readSource(`${BLOCK_DIR}/indexed-db-asset-store.ts`),
  },
  {
    path: "components/blocks/notion-like-editor/use-notion-like-editor.ts",
    code: readSource(`${BLOCK_DIR}/use-notion-like-editor.ts`),
  },
  {
    path: "components/blocks/notion-like-editor/editor-persistence.ts",
    code: readSource(`${BLOCK_DIR}/editor-persistence.ts`),
  },
  {
    path: "components/blocks/notion-like-editor/local-storage-adapter.ts",
    code: readSource(`${BLOCK_DIR}/local-storage-adapter.ts`),
  },
  {
    path: "components/blocks/notion-like-editor/editor-autosave.ts",
    code: readSource(`${BLOCK_DIR}/editor-autosave.ts`),
  },
  {
    path: "components/blocks/notion-like-editor/use-editor-document.ts",
    code: readSource(`${BLOCK_DIR}/use-editor-document.ts`),
  },
  {
    path: "components/blocks/notion-like-editor/editor-surface.tsx",
    code: readSource(`${BLOCK_DIR}/editor-surface.tsx`),
  },
  {
    path: "components/blocks/notion-like-editor/editor-document-skeleton.tsx",
    code: readSource(`${BLOCK_DIR}/editor-document-skeleton.tsx`),
  },
  {
    path: "components/blocks/notion-like-editor/editor-save-status.tsx",
    code: readSource(`${BLOCK_DIR}/editor-save-status.tsx`),
  },
  {
    path: "components/blocks/notion-like-editor/editor-recovery-notice.tsx",
    code: readSource(`${BLOCK_DIR}/editor-recovery-notice.tsx`),
  },
  {
    path: "components/blocks/notion-like-editor/memory-editor.tsx",
    code: readSource(`${BLOCK_DIR}/memory-editor.tsx`),
  },
  {
    path: "components/blocks/notion-like-editor/ready-editor.tsx",
    code: readSource(`${BLOCK_DIR}/ready-editor.tsx`),
  },
  {
    path: "components/blocks/notion-like-editor/persisted-editor.tsx",
    code: readSource(`${BLOCK_DIR}/persisted-editor.tsx`),
  },
  {
    path: "components/blocks/notion-like-editor/notion-like-editor-block.tsx",
    code: readSource(`${BLOCK_DIR}/notion-like-editor-block.tsx`),
  },
  {
    path: "components/blocks/notion-like-editor/demo-document.ts",
    code: readSource(`${BLOCK_DIR}/demo-document.ts`),
  },
  {
    path: "components/blocks/notion-like-editor/notion-like-editor-demo.tsx",
    code: readSource(`${BLOCK_DIR}/notion-like-editor-demo.tsx`),
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
      <NotionLikeEditorDemo />
    </BlockPreviewFrame>
  );
}
