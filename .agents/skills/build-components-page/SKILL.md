---
name: build-components-page
description: Build and update component and block showcase pages for this portfolio. Use when adding a component to /components, adding a block to /blocks, editing a detail page, creating Preview, Code, and llm.txt tabs, documenting installation or APIs, or updating the components count and navigation.
---

# Build Components Page

Create component and block documentation that matches the portfolio's existing layout, interaction, and code-quality conventions.

## Start with project rules

1. Invoke `karpathy-guidelines` before coding.
2. Read `AGENTS.md`, `docs/REFERENCE.md`, `docs/DESIGN.md`, and `docs/CODE_RULES.md`.
3. Inspect the current `/components` page, the closest existing detail page, and the live localhost result before changing structure.
4. Keep changes surgical and server-rendered unless interactivity requires a client leaf.

## Add or update a component

1. Put reusable UI primitives in `packages/core/src/components`.
2. Put the component detail route in `apps/web/src/app/components/<slug>/page.tsx`.
3. Register the component once in `COMPONENT_LIST` in `packages/core/src/components/layouts/components-section.tsx`.
4. Derive displayed totals from `COMPONENT_COUNT`; never duplicate a numeric count.
5. Keep page metadata, the table of contents, section ids, and visible sections synchronized.
6. Publish `llm.txt` in the same change. Follow the section below for a new component and for a new block route at `apps/web/src/app/blocks/<slug>`.

## Publish llm.txt

Do this whenever a showcase component or block is added or its source files change. The generator owns the text. Do not hand-edit `apps/web/public/llms/**` or the `## Code` section of `apps/web/public/llms.txt`.

1. Add or update one entry in `LLMS_CATALOG` in `scripts/llms/catalog.ts`.
2. Set `kind` to `component` or `block`. `slug` matches the route. `description` is the same one-line sentence used on the page. `docsPath` is `/components/<slug>` or `/blocks/<slug>`. Set `registryPath` only when `apps/web/public/r/<slug>.json` exists.
3. List `files` as repo-root paths in read order. For a component, list implementation files, leaves first. For a block, list implementation files, then the route `data.ts` when the preview uses it, then `apps/web/src/app/blocks/<slug>/page.tsx`.
4. From the repo root run `bun run llms`, then `bun run llms:check`. Both must exit 0.
5. On a component page, load `const LLM_TEXT = readLlmsDocument("components", "<slug>")` from `@/lib/read-llms-document` and pass `llm={LLM_TEXT}` to every `ComponentDemo`. On a block page, pass `llmText={readLlmsDocument("blocks", "<slug>")}` to `BlockPreviewFrame`.

## Compose documentation pages

- Use `PageHeader` for the title and an optional compact, single-line description.
- Use `ComponentDemo` for interactive examples. Supply the rendered demo as `children` and the matching TSX usage as `code`.
- Keep Preview, Code, and llm.txt as the line-style tabs, in that order, and retain their icons.
- Center demos inside the bordered preview and constrain the interactive example with `previewClassName` when needed.
- Reuse `Section`, `Separator`, `CodeBlock`, `TerminalBlock`, and the existing table primitives instead of creating parallel styling.
- Pass an explicit language to `CodeBlock` when detection is ambiguous, especially `ts` for type-only snippets and `tsx` for component examples.
- Keep installation instructions bun-first. If the page is manual-only, omit registry and CLI installation alternatives.

## Content rules

- Write direct English copy with no buzzwords.
- Keep the header description to one line and remove redundant description blocks.
- Make demo code represent the visible UI closely enough to copy and use.
- Document props and public types from the implementation; do not invent APIs.
- Use project tokens and existing Tailwind patterns. Do not introduce literal colors, heavy shadows, or decorative motion.

## Verify

1. Run formatting, type checks, lint, and the relevant build.
2. Verify `/components` or `/blocks`, and the changed detail route, in the browser.
3. Check Preview, Code, and llm.txt tab switching, interactive demo behavior, syntax highlighting, console errors, dark mode, and a 360px viewport. The llm.txt panel must show this slug's source paths.
4. Confirm there is no horizontal page overflow and that the component count matches the registry.
