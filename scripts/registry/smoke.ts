/**
 * Runtime smoke renders for the Next.js matrix configs. The probe page server-renders each
 * item's main component with minimal valid props inside a client boundary, so `next build`
 * prerenders it. `file` is the component module under the user's components alias, without
 * extension, so it follows the install target.
 */

export type SmokePart = {
  file: string;
  /** Extra module-level code (imports of third-party packages, sample schemas). */
  prelude?: string;
  /** JSX rendered inside the smoke page. */
  jsx: string;
  /** Named exports imported from `file`. */
  names: readonly string[];
};

export const SMOKE: Readonly<Record<string, readonly SmokePart[]>> = {
  "github-contributions-3d": [
    {
      file: "github-contributions-3d/github-contributions-3d",
      names: ["GitHubContributions3D"],
      jsx: `<GitHubContributions3D name="smoke" data={[{ date: "2026-01-01", count: 1, level: 1 }]} />`,
    },
  ],
  "shadcn-tags-input": [
    {
      file: "shadcn-tags-input/tags-input",
      names: ["TagsInput"],
      jsx: `<TagsInput defaultValue={["alpha"]} />`,
    },
  ],
  "scroll-minimap": [
    {
      file: "scroll-minimap/scroll-minimap",
      names: ["ScrollMinimap"],
      jsx: `<ScrollMinimap items={[{ label: "Intro", href: "#intro" }]} />`,
    },
  ],
  "audio-player": [
    {
      file: "audio-player/audio-player",
      names: ["AudioPlayer"],
      jsx: `<AudioPlayer title="Smoke" src="/audio/smoke.mp3" />`,
    },
  ],
  "video-player": [
    {
      file: "video-player/video-player",
      names: ["VideoPlayer"],
      jsx: `<VideoPlayer title="Smoke" src="/video/smoke.mp4" />`,
    },
  ],
  "zod-data-table": [
    {
      file: "zod-data-table/zod-data-table",
      names: ["ZodDataTable"],
      prelude: `import { z } from "zod";\nconst smokeSchema = z.object({ name: z.string() });`,
      jsx: `<ZodDataTable schema={smokeSchema} data={[{ name: "alpha" }]} />`,
    },
  ],
  "tile-treemap": [
    {
      file: "tile-treemap/tile-treemap",
      names: ["TileTreemap"],
      jsx: `<TileTreemap data={[{ label: "alpha", value: 1 }]} />`,
    },
  ],
  "crm-data-table": [
    {
      file: "blocks/crm-data-table/crm-data-table-block",
      names: ["CrmDataTableBlock"],
      jsx: `<CrmDataTableBlock data={[]} />`,
    },
  ],
  "error-page": [
    {
      file: "blocks/error-page/error-page-block",
      names: ["ErrorPageBlock"],
      jsx: `<ErrorPageBlock code="404" message="Not found" description="Smoke" actions={[{ label: "Home", href: "/" }]} backButton={false} />`,
    },
  ],
  "notion-like-editor": [
    {
      file: "blocks/notion-like-editor/notion-like-editor-block",
      names: ["NotionLikeEditorBlock"],
      jsx: `<NotionLikeEditorBlock documentId="smoke" />`,
    },
    {
      file: "blocks/notion-like-editor/notion-like-editor-static",
      names: ["NotionLikeEditorStatic"],
      jsx: `<NotionLikeEditorStatic value={[{ type: "p", children: [{ text: "Smoke" }] }]} />`,
    },
  ],
};

/** Renders the smoke module source: one client component that renders every part. */
export function smokeModuleSource(parts: readonly SmokePart[], componentsAlias: string): string {
  const imports = parts.map(
    (part) => `import { ${part.names.join(", ")} } from "${componentsAlias}/${part.file}";`,
  );
  const preludes = parts.map((part) => part.prelude ?? "").filter((text) => text !== "");
  const body = parts.map((part) => `      ${part.jsx}`).join("\n");
  return [
    '"use client";',
    "",
    ...imports,
    ...preludes,
    "",
    "export function RegistrySmoke() {",
    "  return (",
    "    <div>",
    body,
    "    </div>",
    "  );",
    "}",
    "",
  ].join("\n");
}
