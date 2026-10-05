"use client";

import { useSyncExternalStore } from "react";

import type { EditorPersistenceAdapter } from "./editor-persistence";
import { EditorDocumentSkeleton } from "./editor-document-skeleton";
import { createLocalStorageAdapter } from "./local-storage-adapter";
import { NotionLikeEditorBlock } from "./notion-like-editor-block";

let demoAdapter: EditorPersistenceAdapter | undefined;

function subscribe(): () => void {
  return () => undefined;
}

function getDemoAdapter(): EditorPersistenceAdapter {
  demoAdapter ??= createLocalStorageAdapter();
  return demoAdapter;
}

function getServerDemoAdapter(): undefined {
  return undefined;
}

export function NotionLikeEditorDemo() {
  const adapter = useSyncExternalStore(subscribe, getDemoAdapter, getServerDemoAdapter);

  if (!adapter) {
    return (
      <div className="bg-background h-full min-h-full w-full min-w-0 px-4">
        <EditorDocumentSkeleton />
      </div>
    );
  }

  return <NotionLikeEditorBlock documentId="demo" adapter={adapter} />;
}
