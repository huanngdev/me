---
name: richcn-editor
description: Installs, mounts, persists and customises the richcn notion-like block editor, a Plate-based rich text editor distributed as a shadcn registry block. Use this skill when the user mentions the notion-like editor, a block editor, a rich text editor, a WYSIWYG editor, or an editor block for shadcn, Plate or richcn, or when a task involves adding the notion-like-editor registry item. It covers installation and the overwrite prompt, memory and persisted modes, the EditorPersistenceAdapter and its autosave debounce, FileUploadAdapter upload handlers with progress and cancellation, LinkPreviewAdapter bookmark previews, MentionProvider and PageProvider, the features and options props, CSS-variable theming, server-side read-only rendering, and troubleshooting Radix-only, Vite alias, hydration and missing-CSS failures.
---

# richcn notion-like editor

A block editor for React, built on Plate (`platejs` 53) and distributed as a shadcn registry block,
so the source lands in the user's own project and every line of it is readable and editable there. A
document is JSON, validated against an allow list of block types, attributes and marks before it is
opened or saved.

The editor has no AI, no live collaboration, no import or export, and no upload backend of its own.
Do not promise any of those.

## Decision flow

Do these in order. Do not skip a step because a later one looks easier.

1. **Install** — run `shadcn add` for the registry item, answer `N` at the overwrite prompt, and
   confirm the dependencies and the CSS arrived.
   → [references/installation.md](references/installation.md) ·
   [docs](https://richcn.huanngdev.site/docs/installation)
2. **Mount** — put the editor in a client component with a `documentId`. Decide up front whether the
   document lives in memory or behind an adapter.
   → [references/usage.md](references/usage.md) ·
   [docs](https://richcn.huanngdev.site/docs/usage)
3. **Persist** — implement `EditorPersistenceAdapter` for the user's API, or use
   `createLocalStorageAdapter` for a demo.
   → [references/persistence.md](references/persistence.md) ·
   [docs](https://richcn.huanngdev.site/docs/persistence)
4. **Uploads** — implement `FileUploadAdapter` if the product stores images, video, audio or files.
   → [references/file-uploads.md](references/file-uploads.md) ·
   [docs](https://richcn.huanngdev.site/docs/file-uploads)
5. **Customise** — turn feature groups off, tune options, theme the CSS variables, and wire mentions
   and page links.
   → [references/customization.md](references/customization.md) ·
   [docs](https://richcn.huanngdev.site/docs/features)
6. **Verify** — run the checklist at the end of this file.

If something is already broken, or the install fought back, go straight to
[references/troubleshooting.md](references/troubleshooting.md).

## Hard rules

- **Radix only.** The block renders the Radix component APIs. A shadcn project on the Base UI style
  does not compile without changes. Do not try to make it work by editing the block.
- **Answer `N` at the overwrite prompt.** shadcn asks before replacing a component the project
  already has. `N` keeps the project's file and installs the rest. Never pass `--yes` to skip the
  prompts unless the user asked for their primitives to be replaced.
- **Never edit the installed primitives.** Do not change `components/ui/*.tsx`. The block is built
  to sit on whatever shape those files already have.
- **Keep the editor behind a client boundary.** `NotionLikeEditorBlock` is a client component. The
  file that passes `onChange`, `onOpenPage`, an adapter or a provider needs `"use client"`.
  `NotionLikeEditorStatic` has no hooks, so a server component can render it directly.
- **Do not invent props.** Before using a prop that is not in
  [references/customization.md](references/customization.md) or the docs, read the installed entry
  point at `@/components/blocks/notion-like-editor/index.tsx` and the type file it re-exports. An API
  that "would make sense" is almost always wrong here.
- **Import from the barrel.** The public entry point is `@/components/blocks/notion-like-editor`.
  Importing an internal file by path works but is not the supported surface.
- **Never touch `window` during a server render.** Adapters and providers that read browser APIs must
  be created on the client. See [references/troubleshooting.md](references/troubleshooting.md).

## Recipes

### Install the block

```bash
npx shadcn@latest add https://www.huanngdev.site/r/notion-like-editor.json
```

The namespace form is `npx shadcn@latest add @huanngdev/notion-like-editor` after registering
`"@huanngdev": "https://www.huanngdev.site/r/{name}.json"` under `registries` in `components.json`.
Full detail, including what gets installed and what to check afterwards, is in
[references/installation.md](references/installation.md).

### Mount a memory-mode editor

The smallest working editor. Without an `adapter` the document lives in component state only.

```tsx
"use client";

import { NotionLikeEditorBlock } from "@/components/blocks/notion-like-editor";

export function NotesEditor() {
  return <NotionLikeEditorBlock documentId="notes" />;
}
```

### Seed the content and read changes

`initialValue` is the content of a _new_ document. With an adapter, the stored document wins and
`initialValue` is used only when the adapter answers `null`.

```tsx
"use client";

import { useState } from "react";

import { NotionLikeEditorBlock, type EditorValue } from "@/components/blocks/notion-like-editor";

const START_VALUE: EditorValue = [
  { type: "h1", children: [{ text: "Release notes" }] },
  { type: "p", children: [{ text: "Write the summary of this release here." }] },
];

export function NotesEditor() {
  const [value, setValue] = useState<EditorValue>(START_VALUE);

  return (
    <div className="space-y-2">
      <NotionLikeEditorBlock documentId="notes" initialValue={START_VALUE} onChange={setValue} />
      <p className="text-muted-foreground text-xs">{value.length} top-level blocks</p>
    </div>
  );
}
```

`readOnly` turns editing off. The content still renders and the block handle is hidden.

### Render saved content on the server

`NotionLikeEditorStatic` has no hooks, takes no adapters and calls nothing, so a server component can
render it. It has no width of its own, so give the element around it one.

```tsx
import { NotionLikeEditorStatic, type EditorValue } from "@/components/blocks/notion-like-editor";

// No "use client" here: the static renderer has no hooks, so a server component can render it.
export function NotesView({ value }: { value: EditorValue }) {
  return (
    <div className="mx-auto w-full max-w-[var(--editor-max-width,700px)]">
      <NotionLikeEditorStatic value={value} />
    </div>
  );
}
```

### Save to the project's own API

Implement `EditorPersistenceAdapter` with `load`, `save` and `saveRecovery`, and pass it as
`adapter`. The revision is the whole concurrency story: send the revision the editor edited from and
the server rejects a stale write. The complete adapter is in
[references/persistence.md](references/persistence.md).

For local storage in a demo, use `createLocalStorageAdapter()` — created on the client, after mount,
because it reads `window` when it is created. The pattern is in
[references/persistence.md](references/persistence.md).

### Store uploaded files

Pass a `FileUploadAdapter` whose `upload(file, { signal, onProgress })` resolves to an object with a
`url`. Without one there is no upload function and dropped files are rejected with a notice. The
complete handler, including cancellation, is in
[references/file-uploads.md](references/file-uploads.md).

### Turn features off, tune options, theme

```tsx
<NotionLikeEditorBlock documentId="notes" features={{ media: false, embeds: false }} />
```

```tsx
<NotionLikeEditorBlock
  documentId="notes"
  options={{
    handle: { gap: 20, centerMax: 48, anchorCenterMax: 64 },
    autosave: { debounceMs: 1500 },
    shortcutHints: false,
    appendOnTailClick: false,
  }}
/>
```

"Off" means the feature cannot be created. Existing content of that type still renders and can still
be edited and deleted. The full feature list, every option, the CSS variables and the mention and
page-link providers are in [references/customization.md](references/customization.md).

## Verify

Run these before calling the work done.

- The project's type check passes, with the editor imported from
  `@/components/blocks/notion-like-editor`.
- The project builds. A missing `@import` or a missing CSS variable shows up here first.
- The page renders without a hydration error in the browser console.
- Typing in the editor works, and the slash menu opens on `/`.
- If an adapter is wired up, a change is saved and survives a reload.
- If uploads are wired up, dropping an image shows a progress state and then the image.
- Dark mode was checked, not assumed.

## References

- [installation.md](references/installation.md) — the commands, what is installed, the prompts, the
  CSS, and the manual check after install.
- [usage.md](references/usage.md) — memory and persisted modes, the props that matter, the static
  renderer, and which file needs `"use client"`.
- [persistence.md](references/persistence.md) — the adapter interface, a complete API adapter, the
  local storage adapter, and the autosave debounce.
- [file-uploads.md](references/file-uploads.md) — the upload contract, a complete handler with
  cancellation, URL resolution, and bookmark previews.
- [customization.md](references/customization.md) — feature switches, options, theming, mentions and
  page links.
- [troubleshooting.md](references/troubleshooting.md) — the install and runtime failure modes and
  what each one means.
