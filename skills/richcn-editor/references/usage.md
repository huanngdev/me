# Usage

## Contents

- [Memory mode](#memory-mode)
- [documentId](#documentid)
- [initialValue and onChange](#initialvalue-and-onchange)
- [readOnly](#readonly)
- [Render saved content on the server](#render-saved-content-on-the-server)
- [Which file needs "use client"](#which-file-needs-use-client)

## Memory mode

The smallest working editor. Without an `adapter` the document lives in component state: it is there
while the editor is mounted and gone after a reload.

```tsx
"use client";

import { NotionLikeEditorBlock } from "@/components/blocks/notion-like-editor";

export function NotesEditor() {
  return <NotionLikeEditorBlock documentId="notes" />;
}
```

## documentId

Required. It is the identity of the document. In persisted mode the editor is keyed by it: a new
value unmounts the current editor and loads that document with `adapter.load`. Every document on a
page needs its own id.

## initialValue and onChange

`initialValue` is the content of a _new_ document. Its default is `EMPTY_EDITOR_VALUE`, one empty
paragraph. With an adapter, the stored document wins as soon as it loads, and `initialValue` is used
only when the adapter answers `null`.

`onChange` is called with the whole value after each change. It is a function prop, so the component
that passes it must be a client component.

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

## readOnly

Turns editing off. The content still renders, the document rules still apply, and the block handle
is not shown. Use it for a viewer that still needs the editor's own markup.

```tsx
"use client";

import { NotionLikeEditorBlock } from "@/components/blocks/notion-like-editor";

export function NotesViewer() {
  return <NotionLikeEditorBlock documentId="notes" readOnly />;
}
```

## Render saved content on the server

`NotionLikeEditorStatic` renders a stored value without Plate's editing surface. It has no hooks and
no `"use client"` directive, so a server component can render it. It takes a `value` and an optional
`className`, and no adapters and no `onChange`.

It has no width of its own, so set one on the element around it, as below, or the read-only output
will be wider than the editor was.

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

## Which file needs "use client"

- The public entry point has no `"use client"` directive, so a server component may import from it.
- `NotionLikeEditorBlock` is a client component in its own file. A server component can render it,
  but only with serializable props. `onChange`, `onOpenPage`, an adapter and the providers are
  functions or objects holding functions, so they must come from a client component.
- `NotionLikeEditorStatic` has no hooks. Render it directly from a page.
- In persisted mode the document is loaded in the browser, so the first render shows the editor's own
  loading skeleton.

The full prop list for both components is at
[richcn.huanngdev.site/docs/props](https://richcn.huanngdev.site/docs/props).
