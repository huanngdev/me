# Notion-like editor

## What it is

A block editor for React, built on Plate (`platejs` 53). A document is JSON, validated against an allow list of block types, attributes and marks before it is opened or saved. The editor has no AI, no live collaboration, no import or export, and no media upload.

## Usage

Memory mode keeps the document in component state. Pass `onChange` to read it.

```tsx
"use client";

import { NotionLikeEditorBlock } from "@repo/core/components/blocks/notion-like-editor/notion-like-editor-block";

export function NotesEditor() {
  return <NotionLikeEditorBlock documentId="notes" placeholder="Write something" />;
}
```

Passing `adapter` switches to persisted mode. The editor loads the document with `adapter.load`, saves it with `adapter.save`, and writes recovery snapshots with `adapter.saveRecovery`. The local storage adapter is `createLocalStorageAdapter` from `lib/document/local-storage-adapter.ts`. The package path map only exports `.tsx` files under `components/`, so this file is not reachable by a package path. The demo imports it by a relative path. Create the adapter in the browser only, because it reads `window` when it is created.

```tsx
"use client";

import { useState } from "react";

import { NotionLikeEditorBlock } from "@repo/core/components/blocks/notion-like-editor/notion-like-editor-block";
import { createLocalStorageAdapter } from "../lib/document/local-storage-adapter";

export function SavedNotes() {
  const [adapter] = useState(() => createLocalStorageAdapter());
  return <NotionLikeEditorBlock documentId="notes" adapter={adapter} />;
}
```

`NotionLikeEditorStatic` renders a stored value without Plate's editing surface. It has no `"use client"` directive, so it can render on the server. It takes no adapters and no `onChange`.

```tsx
import type { Value } from "platejs";

import { NotionLikeEditorStatic } from "@repo/core/components/blocks/notion-like-editor/notion-like-editor-static";

export function NotesView({ value }: { value: Value }) {
  return <NotionLikeEditorStatic value={value} />;
}
```

`EditorValue` (`lib/document/editor-value.ts`) is the `Value` type from `platejs`.

## Props

`NotionLikeEditorBlock` (`NotionLikeEditorBlockProps`, `notion-like-editor-block.tsx`):

- `documentId: string` — the document identity. The persisted editor is keyed by it.
- `initialValue?: EditorValue` — the content of a new document. Defaults to one empty paragraph.
- `onChange?: (value: EditorValue) => void` — called with the value after each change.
- `readOnly?: boolean` — turns editing off. Defaults to `false`.
- `placeholder?: string` — shown in an empty block. Defaults to `"Type something…"`.
- `className?: string` — added to the wrapper element.
- `adapter?: EditorPersistenceAdapter` — selects persisted mode when present.
- `linkPreview?: LinkPreviewAdapter | null` — fills bookmark previews. Defaults to `null`.
- `mentionProvider?: MentionProvider | null` — searches and resolves people for mentions. Defaults to `null`.
- `pageProvider?: PageProvider | null` — searches and resolves pages for page links. Defaults to `null`.
- `onOpenPage?: (request: PageOpenRequest) => void` — called when a user opens a page link.

`NotionLikeEditorStatic` (`NotionLikeEditorStaticProps`, `notion-like-editor-static.tsx`):

- `value: EditorValue` — the document content to render.
- `className?: string` — added to the rendered element.

## Adapters

The editor takes four adapters. Each one is optional. Their shapes below are copied from the source.

`EditorPersistenceAdapter` (`lib/document/editor-persistence.ts`):

```ts
export type EditorPersistenceAdapter = {
  load: (documentId: string) => Promise<unknown | null>;
  save: (request: SaveRequest) => Promise<SaveResult>;
  saveRecovery: (snapshot: RecoverySnapshot) => Promise<void>;
  subscribe?: (documentId: string, onExternalRevision: (revision: number) => void) => () => void;
};
```

`load` returns the stored value, or `null` for a new document. The editor parses the value and opens it. `save` receives the document id, the schema version, the revision the editor edited from, and the content. It returns `saved` with the new revision, `conflict` when another writer saved first, or `error`. `saveRecovery` keeps a snapshot of a document that could not be saved or opened. `subscribe` is optional. When it is present, the editor passes it a callback that receives revisions written elsewhere.

`LinkPreviewAdapter` (`lib/features/editor-bookmark-url.ts`):

```ts
export type LinkPreviewAdapter = {
  fetchPreview: (url: string, signal: AbortSignal) => Promise<LinkPreview | null>;
};
```

The editor never fetches a URL itself. The adapter does. Its comment asks the server to block private, loopback and link-local addresses after DNS resolution, to re-check each redirect (at most 3), to cap the body at 512 KB and the time at 5 seconds, and to parse only `text/html`. Without an adapter, a bookmark shows its domain and no preview is fetched.

`MentionProvider` (`lib/features/editor-mention-node.ts`):

```ts
export type MentionEntity = {
  entityType: MentionEntityType;
  entityId: string;
  label: string;
  email?: string;
};

export type MentionProvider = {
  search: (query: string, signal: AbortSignal) => Promise<MentionEntity[]>;
  resolve?: (
    entityType: string,
    entityId: string,
    signal: AbortSignal,
  ) => Promise<MentionEntity | null>;
};
```

`MentionEntityType` is `"person"`. Without a provider, the `@` trigger does nothing and the Mention slash item is not offered. `resolve` is optional. Without it, a mention shows the label it stored.

`PageProvider`, `PageOpenRequest` and `onOpenPage` (`lib/features/editor-page-link.ts`):

```ts
export type PageEntity = {
  pageId: string;
  title: string;
  icon?: string;
};

export type PageResolution =
  { status: "ok"; page: PageEntity } | { status: "missing" } | { status: "denied" };

export type PageProvider = {
  search: (query: string, signal: AbortSignal) => Promise<PageEntity[]>;
  resolve: (pageId: string, signal: AbortSignal) => Promise<PageResolution>;
};

export type PageOpenRequest = { pageId: string; kind: PageLinkKind };
```

`PageLinkKind` is `"link"` or `"child"`. The kind only picks the icon. Without a `PageProvider`, the Page link slash item is not offered, and an existing page link shows its stored title without resolving it. Without `onOpenPage`, a page link cannot be opened. A `missing` or `denied` resolution also prevents opening.

Everything a provider returns is untrusted. Page search results go through `pagesFromSearch`, which drops entries without a valid page id, cleans titles, keeps one grapheme as the icon, and caps the list at 8 (`lib/features/editor-page-link.ts`). Mention results go through `storedPeople`, which drops entries with the wrong entity type or an invalid id, and sanitizes labels (`lib/plugins/editor-mention.ts`). Bookmark preview text is stripped of control characters and bidi marks, collapsed, and truncated to the field limit. A preview image URL must pass `normalizeBookmarkImageUrl` (`lib/features/editor-bookmark-url.ts`). A page resolution that is not a well-formed answer is treated as unavailable (`components/elements/page-link-element.tsx`).

The demo uses fixture adapters in `demo/demo-link-preview.ts`, `demo/demo-mention.ts` and `demo/demo-pages.ts`. They show the shapes above.

## Document format

A stored document is an envelope (`lib/document/editor-document.ts`):

- `schemaVersion` — the literal `1` (`EDITOR_SCHEMA_VERSION`).
- `documentId` — a non-empty string.
- `revision` — a non-negative integer. It goes up by one on each save.
- `content` — an array of blocks, the editor value.

`serializeEditorDocument` writes only these four fields. `EDITOR_DOCUMENT_LIMITS` sets a maximum nesting depth of 32, a maximum of 20,000 nodes, and a maximum of 2,000,000 bytes of JSON (`lib/document/editor-document.ts`).

Before a document opens, `migrateEditorDocument` wraps a bare array in an envelope with `revision` 0 and `documentId` set to the document id. Other values pass through unchanged (`lib/document/editor-document-migrate.ts`). `parseEditorDocument` then returns one of four outcomes (`lib/document/editor-document-validate.ts`):

- `ok` — the document opens. Repairs are applied and returned with the result, such as a missing block id, a disallowed value, or a list number out of range. The editor shows no notice for repairs on load. Paste shows its repairs in a notice (`components/ui/paste-repair-notice.tsx`).
- `unsupported` — the document uses a block type, attribute, mark or value the allow list does not contain, or a structure the validator rejects. The editor shows a recovery notice with the first five issues and the raw JSON. The user can copy the JSON or start over. Start over saves the original to recovery storage first.
- `invalid` — the stored value is not a document (for example, the envelope is missing fields, or the JSON is too large). The recovery notice is shown in the same way. Storage that cannot be read shows the same notice.
- `future-version` — `schemaVersion` is higher than `1`. The recovery notice says the document is from a newer editor.

The allow lists are `EDITOR_ELEMENT_RULES` and `EDITOR_MARK_RULES` in `lib/document/editor-document-schema.ts`. Block ids are normalized by `lib/document/editor-document-ids.ts`. A missing id gets a new 10-character id.

## Features

<!-- feature-list:start -->

### Blocks

- **Paragraph** — `p`. Entry: Slash "Text"; Shortcut Mod+Alt+0; Shortcut Mod+Shift+0. Static: yes.
- **Heading 1** — `h1`. Entry: Slash "Heading 1"; Shortcut Mod+Alt+1; Input rule "# + space". Static: yes. Limits: Headings take no line height.
- **Heading 2** — `h2`. Entry: Slash "Heading 2"; Shortcut Mod+Alt+2; Input rule "## + space". Static: yes. Limits: Headings take no line height.
- **Heading 3** — `h3`. Entry: Slash "Heading 3"; Shortcut Mod+Alt+3; Input rule "### + space". Static: yes. Limits: Headings take no line height.
- **Quote** — `blockquote`. Entry: Slash "Quote"; Block menu "Quote"; Input rule "> + space". Static: yes. Limits: Children are paragraphs only.
- **Divider** — `hr`. Entry: Slash "Divider"; Input rule "---". Static: yes. Limits: Stores only its id, with no alignment or indent.
- **Bookmark** — `bookmark`. Entry: Slash "Bookmark"; Paste (Bookmark in the link paste menu); Host (LinkPreviewAdapter fills the preview). Static: yes. Limits: Only http and https links; Link up to 2048 characters; Title up to 300, description up to 500, site name up to 100 characters; Without a LinkPreviewAdapter the card shows the domain.
- **Page link** — `page_link`. Entry: Slash "Page link"; Host (onOpenPage receives the page id and kind). Static: yes. Limits: The slash item is offered only with a PageProvider; Title up to 200 characters; Static output has no link.
- **Table of contents** — `toc`. Entry: Slash "Table of contents"; Toolbar "Table of contents depth". Static: yes. Limits: Depth 1 to 3, default 3.
- **Equation** — `equation`. Entry: Slash "Equation". Static: yes. Limits: Expression up to 4000 characters; Control characters other than tab and newline are refused; Rendered with KaTeX.
- **Synced reference** — `synced_ref`. Entry: Pointer (Go to original, Convert to copy, Delete). Static: yes. Limits: No menu item creates a reference yet; Target id up to 200 characters.
- **Callout** — `callout`. Entry: Slash "Callout"; Block menu "Callout"; Toolbar "Callout icon"; Toolbar "Callout tone". Static: yes. Limits: Children are paragraphs only; 12 Lucide icons, with no emoji icons; Four tones: info, success, warning, danger.
- **Toggle** — `toggle`. Entry: Slash "Toggle"; Slash "Toggle heading 1"; Slash "Toggle heading 2"; Slash "Toggle heading 3"; Block menu "Toggle". Static: yes. Limits: Nests up to 3 levels; The first child is a paragraph or a heading from 1 to 3; A list item cannot be the first child.
- **Code block** — `code_block`. Entry: Slash "Code"; Block menu "Code"; Input rule "``` + space"; Toolbar "Code language"; Shortcut Mod+Enter (Exits the code block). Static: yes. Limits: 15 stored languages, plus plain text; An unknown language falls back to plain text.
- **Code line** — `code_line`. Entry: Slash "Code". Static: yes. Limits: Each line is its own block; Indent is refused on code lines.
- **Table** — `table`. Entry: Slash "Table"; Toolbar "Table options". Static: yes. Limits: Up to 50 rows and 20 columns; A slash-inserted table is 3 by 3; A table cannot sit inside a table; Cells hold paragraphs only.
- **Table row** — `tr`. Entry: Toolbar "Insert row". Static: yes. Limits: Up to 20 cells per row.
- **Table cell** — `td`. Entry: Pointer (Click a cell to type in it). Static: yes. Limits: Holds paragraphs only.
- **Table header cell** — `th`. Entry: Toolbar "Header row". Static: yes. Limits: Holds paragraphs only.
- **Columns** — `column_group`. Entry: Slash "Columns"; Block menu "Columns". Static: yes. Limits: 2 or 3 columns; Top level only.
- **Column** — `column`. Entry: Toolbar "Column widths". Static: yes. Limits: Width is stored as a percentage; Cannot hold another column group.
- **Footnote definition** — `footnote_def`. Entry: Shortcut Mod+Enter (In a definition, jumps to its first reference); Pointer (Edit the text in place). Static: yes. Limits: Top level only; A definition moved elsewhere becomes a paragraph; No Turn into or Color in the block menu.

### Inline

- **Link** — `a`. Entry: Slash "Link"; Shortcut Mod+K (Opens the link popover); Toolbar "Link"; Input rule "URL + space or Enter"; Paste (Apply pasted link). Static: yes. Limits: Schemes are http, https, mailto and tel, plus relative and hash URLs; Link up to 2048 characters; target and rel are not stored.
- **Mention** — `mention`. Entry: Slash "Mention"; Input rule "@ then a name"; Host (MentionProvider searches and resolves people). Static: yes. Limits: Label up to 120 characters; Identity is entityType and entityId; Without a MentionProvider the trigger does nothing.
- **Inline equation** — `inline_equation`. Entry: Toolbar "Equation"; Shortcut Mod+Shift+E (Inserts or wraps an equation). Static: yes. Limits: Expression up to 4000 characters; Not inside links, voids or code.
- **Inline date** — `date`. Entry: Shortcut Mod+; (Inserts today); Pointer (Click a date to set or remove it). Static: yes. Limits: Calendar dates only, stored as YYYY-MM-DD; Not inside links, voids or code.
- **Footnote reference** — `footnote_ref`. Entry: Slash "Footnote"; Pointer (Click a reference to see its definition). Static: yes. Limits: The number is derived from document order and not stored; A reference cannot sit inside a definition; A sup element in pasted HTML stays plain text.

### Text styles

- **Bold** — `bold`. Entry: Shortcut Mod+B; Toolbar "Bold"; Input rule "two asterisks around text". Static: yes.
- **Italic** — `italic`. Entry: Shortcut Mod+I; Toolbar "Italic"; Input rule "one asterisk or underscore around text". Static: yes.
- **Underline** — `underline`. Entry: Shortcut Mod+U; Toolbar "Underline". Static: yes.
- **Strikethrough** — `strikethrough`. Entry: Shortcut Mod+Shift+X; Toolbar "Strikethrough"; Input rule "two tildes around text". Static: yes.
- **Inline code** — `code`. Entry: Shortcut Mod+E; Toolbar "Code"; Input rule "backtick around text". Static: yes. Limits: Code text is always monospace.
- **Superscript** — `superscript`. Entry: Shortcut Mod+.; Toolbar "Superscript". Static: yes.
- **Subscript** — `subscript`. Entry: Shortcut Mod+,; Toolbar "Subscript". Static: yes.
- **Keyboard** — `kbd`. Entry: Toolbar "Keyboard". Static: yes. Limits: Set from the More menu only, with no shortcut.
- **Text color** — `color`. Entry: Toolbar "Text color". Static: yes. Limits: 9 palette tokens, with no custom colors.
- **Highlight** — `backgroundColor`. Entry: Toolbar "Highlight". Static: yes. Limits: 9 palette tokens, with no custom colors.
- **Font size** — `fontSize`. Entry: Toolbar "Font size". Static: yes. Limits: 6 presets from 12px to 32px.
- **Font family** — `fontFamily`. Entry: Toolbar "Font family". Static: yes. Limits: 3 families: sans, serif and mono.

### Block attributes

- **Text align** — `align`. Entry: Toolbar "Align". Static: yes. Limits: 4 values: left, center, right and justify; Paragraphs and headings only.
- **Line height** — `lineHeight`. Entry: Toolbar "Line height". Static: yes. Limits: 5 values from 1 to 2; Paragraphs only.
- **Indent** — `indent`. Entry: Shortcut Mod+] (Indent); Shortcut Mod+[ (Outdent); Shortcut Tab (In a list); Toolbar "Indent". Static: yes. Limits: 6 levels; A list uses the same value as its depth.
- **Lists** — `listStyleType`. Entry: Slash "Bulleted list"; Slash "Numbered list"; Slash "To-do list"; Shortcut Mod+Shift+8 (Bulleted list); Shortcut Mod+Shift+7 (Numbered list); Shortcut Mod+Shift+9 (To-do list); Input rule "- + space"; Input rule "1. + space"; Input rule "[] + space". Static: yes. Limits: 3 styles: disc, decimal and todo.
- **Restart numbering** — `listRestart`. Entry: Input rule "N. + space, with N above 1". Static: yes. Limits: Numbers from 1 to 9999; Decimal items only; No menu or toolbar control sets it.
- **To-do checked** — `checked`. Entry: Shortcut Mod+Enter (Checks the to-do). Static: yes. Limits: Stored on to-do items only.
- **Text tone** — `textTone`. Entry: Block menu "Color, Text". Static: yes. Limits: Palette tokens only; Not stored on callouts or toggles.
- **Background tone** — `backgroundTone`. Entry: Block menu "Color, Background". Static: yes. Limits: Palette tokens only; Not stored on callouts or toggles.

### Editing experience

- **Find and replace** — `ux:find`. Entry: Shortcut Mod+F (Opens find). Static: n/a. Limits: Query up to 200 characters; Counts stop at 1000 matches; Replacement up to 1000 characters.
- **Slash menu** — `ux:slash-menu`. Entry: Input rule "/ after a boundary". Static: n/a. Limits: Query up to 40 characters.
- **Block menu** — `ux:block-menu`. Entry: Shortcut Mod+/ (Opens the block menu); Pointer (Click the grip). Static: n/a. Limits: A footnote definition has no Turn into or Color.
- **Block handle** — `ux:block-handle`. Entry: Pointer (Hover a block to show its grip and Add block below). Static: n/a. Limits: Not shown in read-only mode.
- **Drag and drop** — `ux:block-drag`. Entry: Pointer (Drag the grip to move a block). Static: n/a.
- **Block selection** — `ux:block-selection`. Entry: Shortcut Mod+A (Selects the block text, then all blocks); Shortcut Mod+D (With blocks selected, duplicates them); Shortcut Mod+Shift+Alt+ArrowUp (With blocks selected, moves them up); Shortcut Mod+Shift+Alt+ArrowDown (With blocks selected, moves them down). Static: n/a.
- **Undo and redo** — `ux:history`. Entry: Shortcut Mod+Z (Undo); Shortcut Mod+Shift+Z (Redo). Static: n/a. Limits: No undo depth limit is configured.
- **Clear formatting** — `ux:clear-formatting`. Entry: Shortcut Mod+\ (Clear formatting); Toolbar "Clear formatting". Static: n/a. Limits: Removes inline marks only; Block attributes stay.
- **Paste** — `ux:paste`. Entry: Paste (HTML, plain text and pasted links). Static: n/a. Limits: Up to 2000 blocks and 1000000 text characters per paste; HTML over 2000000 characters is dropped and plain text is used; Files and media are not stored.
- **Emoji suggestions** — `ux:emoji`. Entry: Input rule ": then a name". Static: n/a. Limits: 8 suggestions; A closing colon converts only an exact name; Not inside code blocks.
- **Autosave** — `ux:autosave`. Entry: Host (Pass an EditorPersistenceAdapter). Static: n/a. Limits: Waits 800 ms after a change by default; A revision conflict asks the user to reload.
- **Read-only** — `ux:read-only`. Entry: Host (readOnly prop). Static: n/a.
- **Static renderer** — `ux:static-renderer`. Entry: Host (NotionLikeEditorStatic with a value). Static: n/a. Limits: Page links have no URL in output; No editing.
- **Recovery notice** — `ux:recovery`. Entry: Host (Shown when a saved document is invalid, unsupported or from a newer version). Static: n/a. Limits: The original stays in recovery storage.

<!-- feature-list:end -->

## Keyboard shortcuts

Shortcuts are generated from the same inventory as the feature list. `Mod` is Cmd on macOS and Ctrl elsewhere.

<!-- shortcut-list:start -->

- Mod+Alt+0 — Paragraph
- Mod+Shift+0 — Paragraph
- Mod+Alt+1 — Heading 1
- Mod+Alt+2 — Heading 2
- Mod+Alt+3 — Heading 3
- Mod+Enter — Code block (Exits the code block)
- Mod+Enter — Footnote definition (In a definition, jumps to its first reference)
- Mod+K — Link (Opens the link popover)
- Mod+Shift+E — Inline equation (Inserts or wraps an equation)
- Mod+; — Inline date (Inserts today)
- Mod+B — Bold
- Mod+I — Italic
- Mod+U — Underline
- Mod+Shift+X — Strikethrough
- Mod+E — Inline code
- Mod+. — Superscript
- Mod+, — Subscript
- Mod+] — Indent (Indent)
- Mod+[ — Indent (Outdent)
- Tab — Indent (In a list)
- Mod+Shift+8 — Lists (Bulleted list)
- Mod+Shift+7 — Lists (Numbered list)
- Mod+Shift+9 — Lists (To-do list)
- Mod+Enter — To-do checked (Checks the to-do)
- Mod+F — Find and replace (Opens find)
- Mod+/ — Block menu (Opens the block menu)
- Mod+A — Block selection (Selects the block text, then all blocks)
- Mod+D — Block selection (With blocks selected, duplicates them)
- Mod+Shift+Alt+ArrowUp — Block selection (With blocks selected, moves them up)
- Mod+Shift+Alt+ArrowDown — Block selection (With blocks selected, moves them down)
- Mod+Z — Undo and redo (Undo)
- Mod+Shift+Z — Undo and redo (Redo)
- Mod+\ — Clear formatting (Clear formatting)

<!-- shortcut-list:end -->

## Known limits

- No undo depth limit is configured. The editor passes no history options (`lib/plugins/editor-plugins.ts`, `hooks/use-notion-like-editor.ts`).
- Find counts stop at 1000 matches, and the bar shows the count with a plus sign (`lib/features/editor-find.ts`, `components/ui/find-bar.tsx`).
- Tables hold at most 50 rows and 20 columns. A table cannot sit inside another table, and cells hold paragraphs only (`lib/document/editor-document-schema.ts`).
- The slash menu inserts a table at 3 by 3, and the table options menu does not offer a size picker (`lib/features/editor-block-picker.ts`, `lib/commands/editor-table-commands.ts`).
- Footnote definitions are top level only. A definition moved anywhere else becomes a paragraph (`lib/document/editor-document-schema.ts`, `lib/features/editor-footnote-repair.ts`).
- A `<sup>` in pasted HTML stays plain text. Footnotes are not parsed from HTML (`lib/paste/editor-paste.ts`).
- Page links have no URL in static output (`components/static/page-link-static.tsx`).
- Files and media are not stored. Dropped or pasted files are rejected, and the readable text of media is kept (`lib/paste/editor-paste.ts`).
- Paste is capped at 2000 blocks and 1,000,000 text characters, and HTML over 2,000,000 characters is dropped (`lib/paste/editor-paste.ts`).
- Equations are capped at 4000 characters (`lib/document/editor-document-schema.ts`).
- Restart numbering has no menu or toolbar control. Only the numbered input rule with a number above 1 sets it (`lib/plugins/editor-input-rules.ts`).
- Creating a synced reference has no menu item. The command exists and is tested, but no control runs it (`lib/features/editor-synced-block.ts`).
- Autosave waits 800 ms after a change by default (`lib/document/editor-autosave.ts`).
- Emoji data loads on first use (`lib/features/editor-emoji.ts`).
- No browser or device has been tested or certified.

## Development

Run these from the repository root:

- `bun test packages/core` — unit and component tests.
- `bun run check-types` — TypeScript.
- `bun run lint` — ESLint.
- `bun run llms` and `bun run llms:check` — build and check the `llms.txt` output.

The demo is at `/blocks/notion-like-editor` in the web app. Two query parameters change it:

- `?readonly=1` — opens the demo read-only.
- `?static=1` — renders the demo with `NotionLikeEditorStatic`.
