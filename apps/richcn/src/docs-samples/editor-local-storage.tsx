"use client";

import { useSyncExternalStore } from "react";

import {
  NotionLikeEditorBlock,
  createLocalStorageAdapter,
  type EditorPersistenceAdapter,
} from "@repo/core/components/blocks/notion-like-editor/index";

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
