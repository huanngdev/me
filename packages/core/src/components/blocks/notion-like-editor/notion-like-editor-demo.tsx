"use client";

import { useSyncExternalStore } from "react";

import type { AssetStore } from "./editor-assets";
import { demoLinkPreviewAdapter } from "./demo-link-preview";
import { DEMO_DOCUMENT_ID, DEMO_DOCUMENT_VALUE } from "./demo-document";
import { createIndexedDbAssetStore } from "./indexed-db-asset-store";
import type { EditorPersistenceAdapter } from "./editor-persistence";
import { EditorDocumentSkeleton } from "./editor-document-skeleton";
import { createLocalStorageAdapter, removeStaleDemoDocuments } from "./local-storage-adapter";
import { NotionLikeEditorBlock } from "./notion-like-editor-block";

let demoAdapter: EditorPersistenceAdapter | undefined;
let demoStore: AssetStore | null | undefined;

function getDemoStore(): AssetStore | null {
  if (demoStore !== undefined) {
    return demoStore;
  }

  if (typeof indexedDB === "undefined") {
    demoStore = null;
    return demoStore;
  }

  try {
    demoStore = createIndexedDbAssetStore({
      dbName: `notion-like-editor-assets:${DEMO_DOCUMENT_ID}`,
    });
  } catch {
    demoStore = null;
  }

  return demoStore;
}

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
      assetStore={getDemoStore()}
      linkPreview={demoLinkPreviewAdapter}
    />
  );
}
