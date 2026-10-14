# Troubleshooting

## Contents

- [The install does not compile](#the-install-does-not-compile)
- [Imports cannot be resolved](#imports-cannot-be-resolved)
- [The editor renders unstyled](#the-editor-renders-unstyled)
- [A hydration error or "window is not defined"](#a-hydration-error-or-window-is-not-defined)
- [A saved document will not open](#a-saved-document-will-not-open)
- [Symptoms and limits](#symptoms-and-limits)

## The install does not compile

**Base UI.** The block renders the Radix component APIs. A shadcn project set up with the Base UI
style does not compile without changes. This is not fixable by editing the block; the project needs
Radix primitives.

**An overwrite answered `yes`.** If `--yes` was passed, or the overwrite prompt was answered `yes`,
the registry's versions of `components/ui/*.tsx` replaced the project's. Any local change to those
files is gone. Restore them from version control and rerun the install, answering `N`.

**A missing dependency.** If a `@platejs/*` package or `katex` or `highlight.js` is missing from
`package.json`, the install was interrupted. Rerun the add command; it is safe to run again, and
answer `N` at the prompts.

## Imports cannot be resolved

The install writes files to `components/blocks/notion-like-editor/` and the CLI resolves
`@components/...` against the project's components alias, which is usually `@/components`.

- Import from `@/components/blocks/notion-like-editor`. If the import cannot be resolved, the alias
  in the project is not `@/*`, or it points somewhere else. Use the path the project actually has.
- **Vite** needs the alias in two places: the bundler config (`resolve.alias` in `vite.config.ts`)
  and the type checker (`compilerOptions.paths` in `tsconfig.json`). A project where only one is
  configured fails either at build time or in the type check, and the two look like different bugs.
- A server component that imports the block and passes a function prop will fail the Next.js build
  with a serialization error. That is the client boundary, not an alias. See
  [usage.md](usage.md).

## The editor renders unstyled

The 15 CSS rules and the `--editor-*` variables are written into the stylesheet that
`components.json` points at. Check:

1. That stylesheet is actually imported by the app. A project with more than one stylesheet is the
   common case for this.
2. The `--editor-*` variables are in the light and dark blocks of that stylesheet, and the
   `--color-editor-*` mappings are in its `@theme`.
3. Tailwind v4 is scanning the new folder. It scans the project by default, but a project that
   restricts scanning with `@source` needs the component path added.
4. The vidstack stylesheets are imported. The audio and video players ship their own rules that
   import `@vidstack/react/player/styles/base.css` and the caption styles.

Without the variables, the editor still works but the tones, the code colours and the callout
backgrounds fall back to nothing.

## A hydration error or "window is not defined"

`createLocalStorageAdapter()` and the demo's file adapter read `window` when they are created. Build
them on the client only.

- Do not call `createLocalStorageAdapter()` in a module scope or at the top of a server component.
- Do not create it during render on the server. The pattern that works is `useSyncExternalStore`
  with an `undefined` server snapshot, or the same idea behind a `useState` created in an effect.
  Both are in [persistence.md](persistence.md).
- The same rule applies to anything that reads `window`, `document` or `localStorage` while it is
  being constructed.

## A saved document will not open

The editor shows a recovery notice instead of the document. The notice says which of four things
happened:

- **Unsupported** — the document uses a block type, attribute, mark or value the allow list does not
  contain, or a structure the validator rejects. A very common cause is a block written by hand: a
  code line, table row or table cell at the top level, a table inside a table, or a page link with an
  invalid page id. The original stays in recovery storage.
- **Invalid** — the stored value is not a document: the envelope is missing fields, the JSON is over
  2 MB, or storage could not be read.
- **Future version** — `schemaVersion` is higher than `1`. The document was written by a newer
  editor.
- **A conflict** — another writer saved first. The local copy was written to recovery storage.

Do not clear the recovery entry until the content is back. For the full rules, see
[richcn.huanngdev.site/docs/document-format](https://richcn.huanngdev.site/docs/document-format).

## Symptoms and limits

### A part of the editor does not work

- **No upload, or dropped files vanish.** There is no upload function without a `fileUpload` adapter.
  See [file-uploads.md](file-uploads.md).
- **`@` does nothing.** Without a `mentionProvider` the trigger does nothing and the Mention slash
  item is not offered.
- **A feature is missing and the code looks right.** Check that a feature group is not turned off;
  `features` is on the component, not in a config file. With a group off, the entry points are gone
  but existing content still renders.
- **The block handle does not appear.** It is hidden on a device that cannot hover, and it is hidden
  in `readOnly` mode.
- **A shortcut does nothing.** Mod+F is only captured when focus is inside the editor. A markdown
  shortcut typed through an input method composition does not convert.
- **A bookmark shows only a domain.** There is no preview without a `linkPreview` adapter.
- **A page link will not open.** `onOpenPage` is required, and a `missing` or `denied` resolution
  blocks it.
- **An edit is not saved.** A revision conflict stops autosaving and shows the reload notice.

### What the editor does not do

These are limits, not bugs. Do not try to fix them by editing the block.

- No AI, no live collaboration, no presence, no import or export.
- No undo depth limit is configured.
- Find counts stop at 1000 matches.
- A table holds at most 50 rows and 20 columns; the slash menu inserts a 3 by 3 table and there is no
  size picker.
- Footnote definitions are top level only; a definition moved elsewhere becomes a paragraph, and a
  `<sup>` in pasted HTML stays plain text.
- Audio and video play only direct file links the browser can load; a YouTube or Vimeo page link is
  not turned into a player.
- A PDF file block previews only when the browser's PDF viewer is on, and the bytes must start with
  `%PDF-` in the first 1024 bytes.
- Paste is capped at 2000 blocks and 1,000,000 text characters.
- Equations are capped at 4000 characters.
- Restart numbering and synced references have no menu control.
- Touch devices have no block menu or block handle. The selection toolbar and the slash menu do work
  on touch.
- The on-screen keyboard is not handled, so popovers can be covered by it.
- Browser support is measured, not certified: Chrome 154, Firefox and WebKit in automated runs at
  1280×900, plus Chrome and WebKit touch emulation at 390×844. Safari, iOS Safari, Android Chrome,
  VoiceOver and a real Vietnamese IME have not been tested by hand.

The full list is at [richcn.huanngdev.site/docs/known-limits](https://richcn.huanngdev.site/docs/known-limits).
