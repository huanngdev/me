# Customization

## Contents

- [Feature switches](#feature-switches)
- [Options](#options)
- [Theming](#theming)
- [Mentions](#mentions)
- [Page links](#page-links)

## Feature switches

`features` turns groups of editor features off. Every group is on by default. Only a `false` turns a
group off; any other value, and any unknown key, is ignored.

"Off" means the feature cannot be **created**, not that content disappears. Each entry point for the
group is removed and its shortcut, trigger or paste does nothing. Existing content of that type still
renders, and can still be edited and deleted.

| Feature            | Hidden when off                                                                                                                                       |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `media`            | Image, video, audio and file blocks in the slash menu and the Add menu. Uploads: file paste and drop, and the upload tab of the media source popover. |
| `embeds`           | Embed and bookmark blocks in the slash menu and the Add menu. The URL paste menu offers neither option.                                               |
| `tables`           | The table block in the slash menu, the Add menu and Turn into. A pasted HTML table becomes paragraphs.                                                |
| `columns`          | The columns block in the slash menu and the Add menu. Pasted columns become paragraphs.                                                               |
| `code`             | The code block in the slash menu, the Add menu and Turn into, and the ` ``` ` input rule. Pasted code blocks become paragraphs.                       |
| `equations`        | The block and inline equation in the slash menu and the Add menu, the Equation toolbar button, and Mod+Shift+E.                                       |
| `mentions`         | The `@` trigger and the slash Mention item. Pasted mentions become their names as text.                                                               |
| `pageLinks`        | The page link block, its picker and the slash Page link item.                                                                                         |
| `footnotes`        | The slash Footnote item. Pasted footnotes become text.                                                                                                |
| `dates`            | The inline date insert, Mod+;. Pasted dates become their text.                                                                                        |
| `emoji`            | The `:` suggestions, and the closing `:name:` conversion.                                                                                             |
| `toc`              | The table of contents block in the slash menu and the Add menu.                                                                                       |
| `find`             | The find bar and Mod+F. The browser's own find opens instead.                                                                                         |
| `slashMenu`        | The slash menu. Typing `/` inserts the character only.                                                                                                |
| `selectionToolbar` | The floating toolbar over a text selection. The keyboard shortcuts for marks still work.                                                              |
| `blockHandle`      | The block handle, its Add button and grip, the block menu (Mod+/), and drag. Block selection and its keys still work.                                 |

A comment-only editor, with everything that is not text turned off:

```tsx
"use client";

import { NotionLikeEditorBlock } from "@/components/blocks/notion-like-editor";

export function CommentEditor() {
  return (
    <NotionLikeEditorBlock
      documentId="comment-42"
      features={{
        media: false,
        embeds: false,
        tables: false,
        columns: false,
        code: false,
        equations: false,
        mentions: false,
        pageLinks: false,
        footnotes: false,
        dates: false,
        emoji: false,
        toc: false,
      }}
    />
  );
}
```

## Options

`options` is optional and every field inside it is optional. A field that is missing, or holds a
value of the wrong type, takes its default. A number is used only when it is finite and not negative,
and a flag only when it is a boolean.

| Path                     | Type      | Default | Effect                                                                                                                                                  |
| ------------------------ | --------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `handle.gap`             | `number`  | `12`    | Pixels between the block handle and the left edge of its block.                                                                                         |
| `handle.centerMax`       | `number`  | `48`    | Tallest block, in pixels, that the handle is centred on when the block has no anchor.                                                                   |
| `handle.anchorCenterMax` | `number`  | `64`    | Tallest marked anchor, such as a media frame, that the handle is centred on.                                                                            |
| `autosave.debounceMs`    | `number`  | `800`   | Milliseconds after the last change before a save starts. The controller is created when a document opens, so a change applies from the next controller. |
| `shortcutHints`          | `boolean` | `true`  | `false` hides every shortcut hint and every `aria-keyshortcuts` attribute.                                                                              |
| `appendOnTailClick`      | `boolean` | `true`  | `false` stops a click in the empty space below the last block from adding or focusing a paragraph.                                                      |

A change to `handle`, `shortcutHints` or `appendOnTailClick` takes effect at once, with no remount.
Passing a new object with the same values does nothing, because the values are compared, not the
object.

```tsx
"use client";

import { NotionLikeEditorBlock } from "@/components/blocks/notion-like-editor";

export function TunedEditor() {
  return (
    <NotionLikeEditorBlock
      documentId="notes"
      options={{
        handle: { gap: 20, centerMax: 48, anchorCenterMax: 64 },
        autosave: { debounceMs: 1500 },
        shortcutHints: false,
        appendOnTailClick: false,
      }}
    />
  );
}
```

## Theming

`--editor-max-width` sets the width of the editing column. The default is `700px`. Set it, and any
other `--editor-*` variable, on an ancestor of the editor; they are inherited.

```tsx
"use client";

import type { CSSProperties } from "react";

import { NotionLikeEditorBlock } from "@/components/blocks/notion-like-editor";

// Set the editor's own custom properties on an ancestor. They are inherited.
const THEME = {
  "--editor-max-width": "900px",
  "--editor-text-blue": "oklch(0.5 0.13 255)",
  "--editor-callout-info-bg": "oklch(0.96 0.03 255)",
} as CSSProperties;

export function WideEditor() {
  return (
    <div style={THEME}>
      <NotionLikeEditorBlock documentId="notes" />
    </div>
  );
}
```

The registry writes these variables into the project's stylesheet, once for light and once for dark:
`--editor-text-*` (9), `--editor-bg-*` (9), `--editor-callout-*` (10), `--editor-code-*` (12) and
`--editor-font-*` (3). The tone variables are also mapped as Tailwind colours in `@theme`, so
`text-editor-text-blue` and `bg-editor-callout-info-bg` work.

**Every variable has a value in both the light and the dark block.** If the project builds its own
palette, override both, or dark mode will keep the light value. Keys in a `style` object need
`as CSSProperties`.

The static renderer ignores `--editor-max-width`, so give the element around it the same width.

## Mentions

A mention is an inline reference to a person. Typing `@` opens suggestions from the project's
`mentionProvider`. Identity is `entityType` + `entityId`, never the label, so renaming a person later
does not break the link. Without a provider, the `@` trigger does nothing and the Mention item is not
offered.

```ts
import type { MentionEntity, MentionProvider } from "@/components/blocks/notion-like-editor";

type PersonRow = { id: string; name: string; email?: string };

function toEntity(row: PersonRow): MentionEntity {
  return {
    entityType: "person",
    entityId: row.id,
    label: row.name,
    email: row.email,
  };
}

export const mentionProvider: MentionProvider = {
  async search(query, signal) {
    const response = await fetch(`/api/people?q=${encodeURIComponent(query)}`, { signal });
    if (!response.ok) {
      return [];
    }

    const rows = (await response.json()) as PersonRow[];
    return rows.map(toEntity);
  },

  // Optional. Without it, a mention shows the label it stored.
  async resolve(entityType, entityId, signal) {
    if (entityType !== "person") {
      return null;
    }

    const response = await fetch(`/api/people/${entityId}`, { signal });
    if (!response.ok) {
      return null;
    }

    return toEntity((await response.json()) as PersonRow);
  },
};
```

Labels are cut to 120 characters and stripped of control characters. Search results are untrusted:
entries with the wrong entity type or an invalid id are dropped before they reach the list.

## Page links

A page link is a block that points at a page in the project. It shows the page title and icon, and a
click goes through `onOpenPage`. `kind` only picks the icon.

```tsx
"use client";

import { useRouter } from "next/navigation";

import {
  NotionLikeEditorBlock,
  type PageEntity,
  type PageOpenRequest,
  type PageProvider,
} from "@/components/blocks/notion-like-editor";

const pageProvider: PageProvider = {
  async search(query, signal) {
    const response = await fetch(`/api/pages?q=${encodeURIComponent(query)}`, { signal });
    if (!response.ok) {
      return [];
    }

    return (await response.json()) as PageEntity[];
  },

  async resolve(pageId, signal) {
    const response = await fetch(`/api/pages/${encodeURIComponent(pageId)}`, { signal });
    if (response.status === 404) {
      return { status: "missing" };
    }
    if (response.status === 403) {
      return { status: "denied" };
    }
    if (!response.ok) {
      return { status: "missing" };
    }

    return { status: "ok", page: (await response.json()) as PageEntity };
  },
};

export function DocEditor({ pageId }: { pageId: string }) {
  const router = useRouter();

  const openPage = (request: PageOpenRequest) => {
    router.push(`/pages/${encodeURIComponent(request.pageId)}`);
  };

  return (
    <NotionLikeEditorBlock documentId={pageId} pageProvider={pageProvider} onOpenPage={openPage} />
  );
}
```

Without a `PageProvider` the Page link item is not offered and an existing page link shows its stored
title without resolving it. Without `onOpenPage` a page link cannot be opened, and a `missing` or
`denied` resolution blocks opening too. In static output a page link has no URL, so a read-only page
needs no route for it.

More at [richcn.huanngdev.site/docs/features](https://richcn.huanngdev.site/docs/features) and
[richcn.huanngdev.site/docs/theming](https://richcn.huanngdev.site/docs/theming).
