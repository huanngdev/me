"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import {
  isDirectFileUrl,
  resolveFileUrl,
  sanitizeStoredFileUrl,
} from "../../lib/features/editor-file-url";
import type { FileUploadAdapter, UploadedFile } from "../../lib/features/editor-file-upload";
import {
  createUploadController,
  type UploadController,
  type UploadState,
} from "../../lib/features/editor-upload-controller";

export type ResolvedFileUrl = {
  status: "idle" | "loading" | "ready" | "unavailable";
  url?: string;
};

type FileUploadScopeValue = {
  adapter: FileUploadAdapter | null;
  controller: UploadController | null;
};

type Settled = { stored: string; adapter: FileUploadAdapter | null } & (
  { status: "ready"; url: string } | { status: "unavailable" }
);

const FileUploadScopeContext = createContext<FileUploadScopeValue>({
  adapter: null,
  controller: null,
});

function noop(): void {}

export function FileUploadScope({
  adapter,
  onDone,
  children,
}: {
  adapter: FileUploadAdapter | null;
  onDone: (blockId: string, file: UploadedFile) => void;
  children: ReactNode;
}) {
  // The latest onDone is read at finish time, so a new callback does not make a new controller.
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  // The controller is made in an effect. Each mount gets its own, and cleanup disposes it.
  const [controller, setController] = useState<UploadController | null>(null);
  useEffect(() => {
    if (adapter === null) {
      return;
    }

    const next = createUploadController({
      adapter,
      onDone: (blockId, file) => {
        onDoneRef.current(blockId, file);
      },
    });
    setController(next);
    return () => {
      next.dispose();
      setController(null);
    };
  }, [adapter]);

  const value = useMemo(() => ({ adapter, controller }), [adapter, controller]);
  return (
    <FileUploadScopeContext.Provider value={value}>{children}</FileUploadScopeContext.Provider>
  );
}

export function useFileUploadAdapter(): FileUploadAdapter | null {
  return useContext(FileUploadScopeContext).adapter;
}

export function useUploadController(): UploadController | null {
  return useContext(FileUploadScopeContext).controller;
}

export function useUploadState(blockId: string): UploadState | undefined {
  const controller = useUploadController();
  const subscribe = useCallback(
    (listener: () => void) => (controller === null ? noop : controller.subscribe(listener)),
    [controller],
  );
  const getSnapshot = useCallback(() => controller?.get(blockId), [controller, blockId]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

// The http, https or root-relative form of a stored url, which loads without the adapter.
// Null for anything else.
function directFileUrl(stored: string): string | null {
  const clean = sanitizeStoredFileUrl(stored);
  return clean !== null && isDirectFileUrl(clean) ? clean : null;
}

export function useResolvedFileUrl(stored: string | undefined): ResolvedFileUrl {
  const adapter = useFileUploadAdapter();
  const [settled, setSettled] = useState<Settled | undefined>(undefined);
  const direct = stored === undefined ? null : directFileUrl(stored);

  useEffect(() => {
    if (stored === undefined || direct !== null) {
      return;
    }

    const controller = new AbortController();
    void resolveFileUrl(adapter, stored, controller.signal).then((url) => {
      if (controller.signal.aborted) {
        return;
      }

      setSettled(
        url === null
          ? { stored, adapter, status: "unavailable" }
          : { stored, adapter, status: "ready", url },
      );
    });
    return () => {
      controller.abort();
    };
  }, [adapter, stored, direct]);

  if (stored === undefined) {
    return { status: "idle" };
  }

  // An http or https url is ready on the first render, so it never shows "loading".
  if (direct !== null) {
    return { status: "ready", url: direct };
  }

  if (settled === undefined || settled.stored !== stored || settled.adapter !== adapter) {
    return { status: "loading" };
  }

  return settled.status === "ready"
    ? { status: "ready", url: settled.url }
    : { status: "unavailable" };
}
