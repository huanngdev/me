# Persistence

## Contents

- [The interface](#the-interface)
- [An adapter for the project's API](#an-adapter-for-the-projects-api)
- [Local storage](#local-storage)
- [Autosave](#autosave)

## The interface

Passing `adapter` switches the editor from memory mode to persisted mode. The editor loads the
document when it opens, saves it after the autosave debounce, and writes a recovery snapshot when
something fails. These are the contents of the installed `lib/document/editor-persistence.ts`, below
its own relative import of `EditorValue`, which the entry point re-exports.

```ts
export type SaveRequest = {
  documentId: string;
  schemaVersion: number;
  baseRevision: number;
  content: EditorValue;
};

export type SaveResult =
  | { status: "saved"; revision: number }
  | { status: "conflict"; currentRevision: number }
  | {
      status: "error";
      reason: "quota" | "unavailable" | "unknown";
      message: string;
    };

export type RecoverySnapshot = {
  documentId: string;
  revision: number;
  savedAt: string;
  content: EditorValue;
  reason: "conflict" | "save-failed" | "replaced-invalid";
  raw?: unknown;
};

export type EditorPersistenceAdapter = {
  load: (documentId: string) => Promise<unknown | null>;
  save: (request: SaveRequest) => Promise<SaveResult>;
  saveRecovery: (snapshot: RecoverySnapshot) => Promise<void>;
  subscribe?: (documentId: string, onExternalRevision: (revision: number) => void) => () => void;
};
```

- `load` — called once when a document opens. Return the stored value, or `null` for a new document.
  The editor parses the value and opens it, so return whatever the API stored.
- `save` — called after each debounce window. `baseRevision` is the revision the editor edited from.
  Return `saved` with the new revision, `conflict` when another writer saved first, or `error`.
- `saveRecovery` — called with a snapshot when a document could not be saved or opened. Keep it. It is
  the user's only copy at that point.
- `subscribe` — optional. The editor passes a callback that receives revisions written elsewhere,
  such as in another tab.

A `conflict` result stops autosaving, writes a recovery snapshot, and shows the user a notice with a
reload button. An `error` result shows the `message` and keeps the content for a retry.

## An adapter for the project's API

Annotate the object with `EditorPersistenceAdapter` and TypeScript gives every method the right
parameter types.

```ts
import type { EditorPersistenceAdapter } from "@/components/blocks/notion-like-editor";

// The parameter types are inferred from EditorPersistenceAdapter:
// load(documentId: string), save(request: SaveRequest), saveRecovery(snapshot: RecoverySnapshot).
export const apiAdapter: EditorPersistenceAdapter = {
  async load(documentId) {
    const response = await fetch(`/api/documents/${documentId}`, { cache: "no-store" });
    if (response.status === 404) {
      return null; // A new document.
    }
    if (!response.ok) {
      throw new Error("The document could not be loaded.");
    }

    return (await response.json()) as unknown;
  },

  async save(request) {
    const response = await fetch(`/api/documents/${request.documentId}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        schemaVersion: request.schemaVersion,
        baseRevision: request.baseRevision,
        content: request.content,
      }),
    });

    if (response.status === 409) {
      const body = (await response.json()) as { revision: number };
      return { status: "conflict", currentRevision: body.revision };
    }

    if (!response.ok) {
      return { status: "error", reason: "unknown", message: "The document could not be saved." };
    }

    const body = (await response.json()) as { revision: number };
    return { status: "saved", revision: body.revision };
  },

  async saveRecovery(snapshot) {
    // Keep the copy the editor could not save, so the user can recover it later.
    await fetch(`/api/documents/${snapshot.documentId}/recovery`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(snapshot),
    });
  },

  subscribe(documentId, onExternalRevision) {
    // Optional. Report a revision written by another tab or by another user.
    const source = new EventSource(`/api/documents/${documentId}/revisions`);
    source.addEventListener("message", (event) => {
      onExternalRevision(Number(event.data));
    });

    return () => {
      source.close();
    };
  },
};
```

## Local storage

`createLocalStorageAdapter()` stores documents in the browser with the same adapter shape. It reads
`window` when it is created, so build it on the client only: a server render must not touch it. The
pattern below reads it as a value the server does not have, and renders nothing until it exists.

```tsx
"use client";

import { useSyncExternalStore } from "react";

import {
  NotionLikeEditorBlock,
  createLocalStorageAdapter,
  type EditorPersistenceAdapter,
} from "@/components/blocks/notion-like-editor";

let cached: EditorPersistenceAdapter | undefined;

function subscribe(): () => void {
  return () => undefined;
}

function getAdapter(): EditorPersistenceAdapter {
  if (cached === undefined) {
    cached = createLocalStorageAdapter();
  }

  return cached;
}

// The server snapshot is undefined, so no server render touches window.
function getServerAdapter(): undefined {
  return undefined;
}

export function SavedNotes() {
  const adapter = useSyncExternalStore(subscribe, getAdapter, getServerAdapter);

  if (adapter === undefined) {
    return null;
  }

  return (
    <NotionLikeEditorBlock
      documentId="notes"
      adapter={adapter}
      options={{ autosave: { debounceMs: 1500 } }}
    />
  );
}
```

Its options are `storage` (default `window.localStorage`), `keyPrefix` (default
`"notion-like-editor"`; documents are stored at `<keyPrefix>:<documentId>`) and `target` (where the
storage event listener is attached, default `window`).

Local storage is one browser on one device. It is the right default for a demo or a scratchpad, and
the wrong one for anything a user expects to find later.

## Autosave

The default is 800 ms after the last change. A save also starts after a maximum wait, so a long burst
of typing still reaches storage. The save controller is created when a document opens or starts over,
so a changed `debounceMs` applies from the next controller, and the controller already running keeps
its delay.

The local storage sample above sets `options={{ autosave: { debounceMs: 1500 } }}`. The option lives
on the editor, not on the adapter.

More at [richcn.huanngdev.site/docs/persistence](https://richcn.huanngdev.site/docs/persistence).
