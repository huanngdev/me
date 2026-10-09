"use client";

import { useSyncExternalStore } from "react";

import { demoLinkPreviewAdapter } from "./demo/demo-link-preview";
import { demoMentionProvider } from "./demo/demo-mention";
import { DEMO_DOCUMENT_ID, DEMO_DOCUMENT_VALUE } from "./demo/demo-document";
import type { EditorPersistenceAdapter } from "./lib/document/editor-persistence";
import { EditorDocumentSkeleton } from "./components/editor/editor-document-skeleton";
import {
  createLocalStorageAdapter,
  removeStaleDemoDocuments,
} from "./lib/document/local-storage-adapter";
import { NotionLikeEditorBlock } from "./notion-like-editor-block";

let demoAdapter: EditorPersistenceAdapter | undefined;

function subscribe(): () => void {
  return () => undefined;
}

function getDemoAdapter(): EditorPersistenceAdapter {
  if (demoAdapter !== undefined) {
    return demoAdapter;
  }

  demoAdapter = createLocalStorageAdapter();
  try {
    removeStaleDemoDocuments(window.localStorage, DEMO_DOCUMENT_ID);
  } catch {
    // Reading localStorage can throw. The editor still opens on the current id.
  }

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

  return (
    <NotionLikeEditorBlock
      documentId={DEMO_DOCUMENT_ID}
      adapter={adapter}
      initialValue={DEMO_DOCUMENT_VALUE}
      linkPreview={demoLinkPreviewAdapter}
      mentionProvider={demoMentionProvider}
    />
  );
}
