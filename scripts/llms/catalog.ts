export type LlmsKind = "component" | "block";

export type LlmsCatalogEntry = {
  kind: LlmsKind;
  slug: string;
  name: string;
  description: string;
  docsPath: string;
  registryPath?: string;
  files: readonly string[];
};

export const LLMS_CATALOG: readonly LlmsCatalogEntry[] = [
  {
    kind: "component",
    slug: "github-contributions-3d",
    name: "GitHub Contributions 3D",
    description: "An interactive Three.js contribution calendar with six themes.",
    docsPath: "/components/github-contributions-3d",
    files: [
      "packages/core/src/components/github-contributions-3d.utils.ts",
      "packages/core/src/components/github-contributions-3d.tsx",
    ],
  },
  {
    kind: "component",
    slug: "shadcn-tags-input",
    name: "Tags Input",
    description: "A composable tags input built on shadcn primitives.",
    docsPath: "/components/shadcn-tags-input",
    registryPath: "/r/shadcn-tags-input.json",
    files: ["packages/core/src/components/shadcn-tags-input/tags-input.tsx"],
  },
  {
    kind: "component",
    slug: "scroll-minimap",
    name: "Scroll Minimap",
    description: "A compact scrollspy navigator for long content.",
    docsPath: "/components/scroll-minimap",
    files: ["packages/core/src/components/scroll-minimap.tsx"],
  },
  {
    kind: "component",
    slug: "video-player",
    name: "Video Player",
    description: "A headless media player with shadcn controls.",
    docsPath: "/components/video-player",
    files: [
      "packages/core/src/components/video-player/use-video-player.ts",
      "packages/core/src/components/video-player/video-player.tsx",
    ],
  },
  {
    kind: "component",
    slug: "zod-data-table",
    name: "Zod Data Table",
    description: "A typed TanStack table generated from a Zod object schema.",
    docsPath: "/components/zod-data-table",
    registryPath: "/r/zod-data-table.json",
    files: ["packages/core/src/components/zod-data-table/zod-data-table.tsx"],
  },
  {
    kind: "component",
    slug: "tile-treemap",
    name: "Tile Treemap",
    description: "Divide a single box into proportionally sized, color-coded tiles.",
    docsPath: "/components/tile-treemap",
    files: [
      "packages/core/src/components/tile-treemap.utils.ts",
      "packages/core/src/components/tile-treemap.tsx",
    ],
  },
  {
    kind: "block",
    slug: "crm-data-table",
    name: "CRM Data Table",
    description:
      "A CRM customers table with faceted filters, sorting, selection, expandable rows, row pinning, and column controls.",
    docsPath: "/blocks/crm-data-table",
    files: [
      "packages/core/src/components/blocks/crm-data-table/types.ts",
      "packages/core/src/components/blocks/crm-data-table/crm-data-table-format.ts",
      "packages/core/src/components/blocks/crm-data-table/crm-data-table-features.ts",
      "packages/core/src/components/blocks/crm-data-table/crm-data-table-filter.tsx",
      "packages/core/src/components/blocks/crm-data-table/crm-data-table-columns.tsx",
      "packages/core/src/components/blocks/crm-data-table/crm-data-table-row-detail.tsx",
      "packages/core/src/components/blocks/crm-data-table/crm-data-table.tsx",
      "packages/core/src/components/blocks/crm-data-table/crm-data-table-toolbar.tsx",
      "packages/core/src/components/blocks/crm-data-table/crm-data-table-pagination.tsx",
      "packages/core/src/components/blocks/crm-data-table/use-crm-table.ts",
      "packages/core/src/components/blocks/crm-data-table/crm-data-table-block.tsx",
      "apps/web/src/app/blocks/crm-data-table/data.ts",
      "apps/web/src/app/blocks/crm-data-table/page.tsx",
    ],
  },
  {
    kind: "block",
    slug: "error-page",
    name: "Error Page",
    description: "A minimal fullscreen error page with clear recovery actions.",
    docsPath: "/blocks/error-page",
    files: [
      "packages/core/src/components/blocks/error-page-block.tsx",
      "apps/web/src/app/blocks/error-page/page.tsx",
    ],
  },
  {
    kind: "block",
    slug: "notion-like-editor",
    name: "Notion-like Editor",
    description: "A Notion-style block editor built on Plate with shadcn primitives.",
    docsPath: "/blocks/notion-like-editor",
    files: [
      "packages/core/src/components/blocks/notion-like-editor/editor-value.ts",
      "packages/core/src/components/blocks/notion-like-editor/editor-document-schema.ts",
      "packages/core/src/components/blocks/notion-like-editor/editor-document.ts",
      "packages/core/src/components/blocks/notion-like-editor/editor-document-ids.ts",
      "packages/core/src/components/blocks/notion-like-editor/editor-document-migrate.ts",
      "packages/core/src/components/blocks/notion-like-editor/editor-document-validate.ts",
      "packages/core/src/components/blocks/notion-like-editor/editor-paste.ts",
      "packages/core/src/components/blocks/notion-like-editor/editor-plugins.ts",
      "packages/core/src/components/blocks/notion-like-editor/heading-element.tsx",
      "packages/core/src/components/blocks/notion-like-editor/block-list.tsx",
      "packages/core/src/components/blocks/notion-like-editor/blockquote-element.tsx",
      "packages/core/src/components/blocks/notion-like-editor/callout-element.tsx",
      "packages/core/src/components/blocks/notion-like-editor/hr-element.tsx",
      "packages/core/src/components/blocks/notion-like-editor/editor-selection.ts",
      "packages/core/src/components/blocks/notion-like-editor/editor-commands.ts",
      "packages/core/src/components/blocks/notion-like-editor/editor-assets.ts",
      "packages/core/src/components/blocks/notion-like-editor/asset-validation.ts",
      "packages/core/src/components/blocks/notion-like-editor/upload-controller.ts",
      "packages/core/src/components/blocks/notion-like-editor/asset-references.ts",
      "packages/core/src/components/blocks/notion-like-editor/indexed-db-asset-store.ts",
      "packages/core/src/components/blocks/notion-like-editor/use-notion-like-editor.ts",
      "packages/core/src/components/blocks/notion-like-editor/editor-persistence.ts",
      "packages/core/src/components/blocks/notion-like-editor/local-storage-adapter.ts",
      "packages/core/src/components/blocks/notion-like-editor/editor-autosave.ts",
      "packages/core/src/components/blocks/notion-like-editor/use-editor-document.ts",
      "packages/core/src/components/blocks/notion-like-editor/editor-surface.tsx",
      "packages/core/src/components/blocks/notion-like-editor/editor-document-skeleton.tsx",
      "packages/core/src/components/blocks/notion-like-editor/editor-save-status.tsx",
      "packages/core/src/components/blocks/notion-like-editor/editor-recovery-notice.tsx",
      "packages/core/src/components/blocks/notion-like-editor/memory-editor.tsx",
      "packages/core/src/components/blocks/notion-like-editor/ready-editor.tsx",
      "packages/core/src/components/blocks/notion-like-editor/persisted-editor.tsx",
      "packages/core/src/components/blocks/notion-like-editor/notion-like-editor-block.tsx",
      "packages/core/src/components/blocks/notion-like-editor/demo-document.ts",
      "packages/core/src/components/blocks/notion-like-editor/notion-like-editor-demo.tsx",
      "apps/web/src/app/blocks/notion-like-editor/page.tsx",
    ],
  },
];
