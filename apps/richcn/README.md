# richcn

A demo and docs app for the notion-like rich text editor that lives in `@repo/core`. The home page
is the editor itself; everything under `/docs` is how to install and use it.

## Run it

From the repository root:

```bash
cd apps/richcn && bun run dev
```

The dev server listens on port 3001 so it does not clash with `apps/web` on port 3000. Other
scripts: `bun run build`, `bun run check-types`, `bun run lint`.

## Environment

`NEXT_PUBLIC_SITE_URL` sets the public origin the site is built for. It feeds `SITE.url`, and
everything absolute derives from it: `metadataBase`, the canonical links, the Open Graph image URLs,
the sitemap, `robots.txt` and `llms.txt`.

The default is `https://richcn.huanngdev.site`, so a local `bun run dev` needs no `.env` file. Set it
in the deployment environment to preview the site under another domain; a trailing slash is stripped.

## Pages

- `/` — the editor demo, from `@repo/core`. Query parameters change its mode: `?readonly=1`,
  `?static=1`, and `?off=tables,media` to pass `features` with the named features off.
- `/docs` — introduction: what the editor is, what it is not, requirements and a quick start.
- `/docs/installation` — the `shadcn add` commands, what gets installed and the prompts.
- `/docs/usage` — mounting the editor, `initialValue`, `onChange`, `readOnly`, and the server-side
  `NotionLikeEditorStatic`.
- `/docs/persistence` — `EditorPersistenceAdapter`, a complete adapter for your own API, and
  `createLocalStorageAdapter`.
- `/docs/file-uploads` — `FileUploadAdapter`, a complete upload handler, and bookmark previews.
- `/docs/mentions-and-page-links` — `MentionProvider`, `PageProvider` and `onOpenPage`.
- `/docs/features` — the `features` prop and every group it can turn off.
- `/docs/options` — every field of the `options` prop with its default.
- `/docs/theming` — the `--editor-*` CSS variables, overrides, dark mode and the editor width.
- `/docs/props` — the full prop tables and the public exports.
- `/docs/keyboard-shortcuts` — every shortcut, on macOS and on Windows and Linux.
- `/docs/document-format` — the JSON envelope, its limits, migration and validation outcomes.
- `/docs/known-limits` — what the editor does not do yet, stated plainly.
- `/docs/faq` — short answers to the questions developers ask first.
- `/docs/agent-skills` — the Agent Skill for this editor, and how to install it.

## How the docs are built

`src/lib/docs.ts` is the single registry: it feeds the sidebar, the prev/next links and each page's
metadata. Pages are server components under `src/app/docs/<slug>/page.tsx`, built from
`src/components/docs/*`.

Code shown in the docs is not typed by hand. `src/docs-samples/*` are real, type-checked files, and
a page renders one by reading its text at build time (`src/lib/docs-samples.ts`), replacing the
monorepo import with the path an installed copy uses. The install facts on `/docs/installation` and
the variable list on `/docs/theming` are read from `apps/web/public/r/notion-like-editor.json` and
`apps/web/src/generated/registry-summary.json`, so they match the published registry.

The Agent Skill for the editor lives at the repository root, in `skills/richcn-editor/`, and the
code in it is copied from the same type-checked samples. `/docs/agent-skills` documents it.
