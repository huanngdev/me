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
    path: "components/blocks/notion-like-editor/lib/document/editor-value.ts",
    code: readSource(`${BLOCK_DIR}/lib/document/editor-value.ts`),
  },
  {
    path: "components/blocks/notion-like-editor/lib/document/editor-document-schema.ts",
    code: readSource(`${BLOCK_DIR}/lib/document/editor-document-schema.ts`),
  },
  {
    path: "components/blocks/notion-like-editor/lib/document/editor-document.ts",
    code: readSource(`${BLOCK_DIR}/lib/document/editor-document.ts`),
  },
  {
    path: "components/blocks/notion-like-editor/lib/document/editor-document-ids.ts",
    code: readSource(`${BLOCK_DIR}/lib/document/editor-document-ids.ts`),
  },
  {
    path: "components/blocks/notion-like-editor/lib/document/editor-document-migrate.ts",
    code: readSource(`${BLOCK_DIR}/lib/document/editor-document-migrate.ts`),
  },
  {
    path: "components/blocks/notion-like-editor/lib/document/editor-document-validate.ts",
    code: readSource(`${BLOCK_DIR}/lib/document/editor-document-validate.ts`),
  },
  {
    path: "components/blocks/notion-like-editor/lib/paste/editor-paste.ts",
    code: readSource(`${BLOCK_DIR}/lib/paste/editor-paste.ts`),
  },
  {
    path: "components/blocks/notion-like-editor/lib/paste/editor-paste-repairs.ts",
    code: readSource(`${BLOCK_DIR}/lib/paste/editor-paste-repairs.ts`),
  },
  {
    path: "components/blocks/notion-like-editor/components/ui/paste-repair-notice.tsx",
    code: readSource(`${BLOCK_DIR}/components/ui/paste-repair-notice.tsx`),
  },
  {
    path: "components/blocks/notion-like-editor/components/ui/block-toolbar.tsx",
    code: readSource(`${BLOCK_DIR}/components/ui/block-toolbar.tsx`),
  },
  {
    path: "components/blocks/notion-like-editor/lib/plugins/editor-plugins.ts",
    code: readSource(`${BLOCK_DIR}/lib/plugins/editor-plugins.ts`),
  },
  {
    path: "components/blocks/notion-like-editor/lib/plugins/editor-toggle.ts",
    code: readSource(`${BLOCK_DIR}/lib/plugins/editor-toggle.ts`),
  },
  {
    path: "components/blocks/notion-like-editor/components/elements/heading-element.tsx",
    code: readSource(`${BLOCK_DIR}/components/elements/heading-element.tsx`),
  },
  {
    path: "components/blocks/notion-like-editor/components/elements/block-list.tsx",
    code: readSource(`${BLOCK_DIR}/components/elements/block-list.tsx`),
  },
  {
    path: "components/blocks/notion-like-editor/components/elements/blockquote-element.tsx",
    code: readSource(`${BLOCK_DIR}/components/elements/blockquote-element.tsx`),
  },
  {
    path: "components/blocks/notion-like-editor/components/elements/callout-element.tsx",
    code: readSource(`${BLOCK_DIR}/components/elements/callout-element.tsx`),
  },
  {
    path: "components/blocks/notion-like-editor/lib/features/editor-code.ts",
    code: readSource(`${BLOCK_DIR}/lib/features/editor-code.ts`),
  },
  {
    path: "components/blocks/notion-like-editor/components/elements/code-block-element.tsx",
    code: readSource(`${BLOCK_DIR}/components/elements/code-block-element.tsx`),
  },
  {
    path: "components/blocks/notion-like-editor/lib/features/editor-table.ts",
    code: readSource(`${BLOCK_DIR}/lib/features/editor-table.ts`),
  },
  {
    path: "components/blocks/notion-like-editor/lib/features/editor-table-grid.ts",
    code: readSource(`${BLOCK_DIR}/lib/features/editor-table-grid.ts`),
  },
  {
    path: "components/blocks/notion-like-editor/lib/commands/editor-table-commands.ts",
    code: readSource(`${BLOCK_DIR}/lib/commands/editor-table-commands.ts`),
  },
  {
    path: "components/blocks/notion-like-editor/components/elements/table-element.tsx",
    code: readSource(`${BLOCK_DIR}/components/elements/table-element.tsx`),
  },
  {
    path: "components/blocks/notion-like-editor/components/ui/table-controls.tsx",
    code: readSource(`${BLOCK_DIR}/components/ui/table-controls.tsx`),
  },
  {
    path: "components/blocks/notion-like-editor/components/elements/toggle-element.tsx",
    code: readSource(`${BLOCK_DIR}/components/elements/toggle-element.tsx`),
  },
  {
    path: "components/blocks/notion-like-editor/components/elements/hr-element.tsx",
    code: readSource(`${BLOCK_DIR}/components/elements/hr-element.tsx`),
  },
  {
    path: "components/blocks/notion-like-editor/lib/paste/editor-paste-url.ts",
    code: readSource(`${BLOCK_DIR}/lib/paste/editor-paste-url.ts`),
  },
  {
    path: "components/blocks/notion-like-editor/lib/features/editor-bookmark-url.ts",
    code: readSource(`${BLOCK_DIR}/lib/features/editor-bookmark-url.ts`),
  },
  {
    path: "components/blocks/notion-like-editor/lib/features/editor-bookmark.ts",
    code: readSource(`${BLOCK_DIR}/lib/features/editor-bookmark.ts`),
  },
  {
    path: "components/blocks/notion-like-editor/components/elements/bookmark-element.tsx",
    code: readSource(`${BLOCK_DIR}/components/elements/bookmark-element.tsx`),
  },
  {
    path: "components/blocks/notion-like-editor/lib/commands/editor-columns.ts",
    code: readSource(`${BLOCK_DIR}/lib/commands/editor-columns.ts`),
  },
  {
    path: "components/blocks/notion-like-editor/components/elements/column-element.tsx",
    code: readSource(`${BLOCK_DIR}/components/elements/column-element.tsx`),
  },
  {
    path: "components/blocks/notion-like-editor/lib/features/editor-toc.ts",
    code: readSource(`${BLOCK_DIR}/lib/features/editor-toc.ts`),
  },
  {
    path: "components/blocks/notion-like-editor/components/elements/toc-element.tsx",
    code: readSource(`${BLOCK_DIR}/components/elements/toc-element.tsx`),
  },
  {
    path: "components/blocks/notion-like-editor/lib/features/editor-equation.ts",
    code: readSource(`${BLOCK_DIR}/lib/features/editor-equation.ts`),
  },
  {
    path: "components/blocks/notion-like-editor/components/elements/equation-element.tsx",
    code: readSource(`${BLOCK_DIR}/components/elements/equation-element.tsx`),
  },
  {
    path: "components/blocks/notion-like-editor/lib/features/editor-synced-block.ts",
    code: readSource(`${BLOCK_DIR}/lib/features/editor-synced-block.ts`),
  },
  {
    path: "components/blocks/notion-like-editor/components/elements/synced-ref-element.tsx",
    code: readSource(`${BLOCK_DIR}/components/elements/synced-ref-element.tsx`),
  },
  {
    path: "components/blocks/notion-like-editor/lib/features/editor-link-url.ts",
    code: readSource(`${BLOCK_DIR}/lib/features/editor-link-url.ts`),
  },
  {
    path: "components/blocks/notion-like-editor/lib/plugins/editor-link.ts",
    code: readSource(`${BLOCK_DIR}/lib/plugins/editor-link.ts`),
  },
  {
    path: "components/blocks/notion-like-editor/components/elements/link-element.tsx",
    code: readSource(`${BLOCK_DIR}/components/elements/link-element.tsx`),
  },
  {
    path: "components/blocks/notion-like-editor/components/ui/link-popover.tsx",
    code: readSource(`${BLOCK_DIR}/components/ui/link-popover.tsx`),
  },
  {
    path: "components/blocks/notion-like-editor/lib/features/editor-mention-node.ts",
    code: readSource(`${BLOCK_DIR}/lib/features/editor-mention-node.ts`),
  },
  {
    path: "components/blocks/notion-like-editor/lib/plugins/editor-mention.ts",
    code: readSource(`${BLOCK_DIR}/lib/plugins/editor-mention.ts`),
  },
  {
    path: "components/blocks/notion-like-editor/components/elements/mention-element.tsx",
    code: readSource(`${BLOCK_DIR}/components/elements/mention-element.tsx`),
  },
  {
    path: "components/blocks/notion-like-editor/components/ui/paste-url-menu.tsx",
    code: readSource(`${BLOCK_DIR}/components/ui/paste-url-menu.tsx`),
  },
  {
    path: "components/blocks/notion-like-editor/lib/features/editor-selection.ts",
    code: readSource(`${BLOCK_DIR}/lib/features/editor-selection.ts`),
  },
  {
    path: "components/blocks/notion-like-editor/lib/commands/editor-commands.ts",
    code: readSource(`${BLOCK_DIR}/lib/commands/editor-commands.ts`),
  },
  {
    path: "components/blocks/notion-like-editor/hooks/use-notion-like-editor.ts",
    code: readSource(`${BLOCK_DIR}/hooks/use-notion-like-editor.ts`),
  },
  {
    path: "components/blocks/notion-like-editor/lib/document/editor-persistence.ts",
    code: readSource(`${BLOCK_DIR}/lib/document/editor-persistence.ts`),
  },
  {
    path: "components/blocks/notion-like-editor/lib/document/local-storage-adapter.ts",
    code: readSource(`${BLOCK_DIR}/lib/document/local-storage-adapter.ts`),
  },
  {
    path: "components/blocks/notion-like-editor/lib/document/editor-autosave.ts",
    code: readSource(`${BLOCK_DIR}/lib/document/editor-autosave.ts`),
  },
  {
    path: "components/blocks/notion-like-editor/hooks/use-editor-document.ts",
    code: readSource(`${BLOCK_DIR}/hooks/use-editor-document.ts`),
  },
  {
    path: "components/blocks/notion-like-editor/components/editor/editor-surface.tsx",
    code: readSource(`${BLOCK_DIR}/components/editor/editor-surface.tsx`),
  },
  {
    path: "components/blocks/notion-like-editor/components/editor/editor-document-skeleton.tsx",
    code: readSource(`${BLOCK_DIR}/components/editor/editor-document-skeleton.tsx`),
  },
  {
    path: "components/blocks/notion-like-editor/components/editor/editor-save-status.tsx",
    code: readSource(`${BLOCK_DIR}/components/editor/editor-save-status.tsx`),
  },
  {
    path: "components/blocks/notion-like-editor/components/editor/editor-recovery-notice.tsx",
    code: readSource(`${BLOCK_DIR}/components/editor/editor-recovery-notice.tsx`),
  },
  {
    path: "components/blocks/notion-like-editor/components/editor/memory-editor.tsx",
    code: readSource(`${BLOCK_DIR}/components/editor/memory-editor.tsx`),
  },
  {
    path: "components/blocks/notion-like-editor/components/editor/ready-editor.tsx",
    code: readSource(`${BLOCK_DIR}/components/editor/ready-editor.tsx`),
  },
  {
    path: "components/blocks/notion-like-editor/components/editor/persisted-editor.tsx",
    code: readSource(`${BLOCK_DIR}/components/editor/persisted-editor.tsx`),
  },
  {
    path: "components/blocks/notion-like-editor/notion-like-editor-block.tsx",
    code: readSource(`${BLOCK_DIR}/notion-like-editor-block.tsx`),
  },
  {
    path: "components/blocks/notion-like-editor/demo/demo-document.ts",
    code: readSource(`${BLOCK_DIR}/demo/demo-document.ts`),
  },
  {
    path: "components/blocks/notion-like-editor/demo/demo-link-preview.ts",
    code: readSource(`${BLOCK_DIR}/demo/demo-link-preview.ts`),
  },
  {
    path: "components/blocks/notion-like-editor/demo/demo-mention.ts",
    code: readSource(`${BLOCK_DIR}/demo/demo-mention.ts`),
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
