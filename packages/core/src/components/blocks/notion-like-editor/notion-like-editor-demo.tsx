"use client";

import { lazy, Suspense, useSyncExternalStore } from "react";

import { demoFileUploadAdapter } from "./demo/demo-file-upload";
import { demoLinkPreviewAdapter } from "./demo/demo-link-preview";
import { demoMentionProvider } from "./demo/demo-mention";
import { demoPageProvider } from "./demo/demo-pages";
import { DEMO_DOCUMENT_ID, DEMO_DOCUMENT_VALUE } from "./demo/demo-document";
import { createLocalStorageAdapter, type EditorPersistenceAdapter } from "./index";
import { EditorDocumentSkeleton } from "./components/editor/editor-document-skeleton";
import { removeStaleDemoDocuments } from "./lib/document/local-storage-adapter";
import { NotionLikeEditorBlock } from "./notion-like-editor-block";
import { parseOffFeatures } from "./demo/demo-feature-flags";
import type { EditorFeatures } from "./lib/features/editor-features";
import { LIST_SIBLING_GAP_CLASS } from "./components/elements/block-list-metrics";

const StaticDocument = lazy(() =>
  import("./notion-like-editor-static").then((mod) => ({
    default: function StaticDocumentView() {
      return (
        <div className="mx-auto flex h-full min-h-full w-full max-w-[var(--editor-max-width,700px)] min-w-0 flex-col">
          <mod.NotionLikeEditorStatic
            value={DEMO_DOCUMENT_VALUE}
            className={`text-foreground min-h-full w-full min-w-0 space-y-4 py-8 text-base leading-relaxed wrap-break-word outline-none sm:py-12 ${LIST_SIBLING_GAP_CLASS}`}
          />
        </div>
      );
    },
  })),
);

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

function readReadonlyFlag(): boolean {
  return new URLSearchParams(window.location.search).get("readonly") === "1";
}

function readReadonlyServer(): boolean {
  return false;
}

function readStaticFlag(): boolean {
  return new URLSearchParams(window.location.search).get("static") === "1";
}

function readStaticServer(): boolean {
  return false;
}

// The server renders with every feature on. The client keeps the parsed value for one query string,
// so the snapshot is the same object on each render and useSyncExternalStore does not loop.
const NO_FEATURES_OFF: EditorFeatures = {};
let offFlag: { search: string; features: EditorFeatures } | undefined;

function readOffFlag(): EditorFeatures {
  const search = window.location.search;
  if (offFlag?.search !== search) {
    offFlag = { search, features: parseOffFeatures(search) };
  }
  return offFlag.features;
}

function readOffServer(): EditorFeatures {
  return NO_FEATURES_OFF;
}

export function NotionLikeEditorDemo() {
  const adapter = useSyncExternalStore(subscribe, getDemoAdapter, getServerDemoAdapter);
  const readOnly = useSyncExternalStore(subscribe, readReadonlyFlag, readReadonlyServer);
  const staticView = useSyncExternalStore(subscribe, readStaticFlag, readStaticServer);
  const features = useSyncExternalStore(subscribe, readOffFlag, readOffServer);

  if (staticView) {
    return (
      <div className="bg-background h-full min-h-full w-full min-w-0 px-4">
        <Suspense fallback={null}>
          <StaticDocument />
        </Suspense>
      </div>
    );
  }

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
      pageProvider={demoPageProvider}
      fileUpload={demoFileUploadAdapter}
      readOnly={readOnly}
      features={features}
    />
  );
}
