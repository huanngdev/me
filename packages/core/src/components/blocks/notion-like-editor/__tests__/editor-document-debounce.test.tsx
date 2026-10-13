import { describe, expect, test } from "bun:test";
import { act } from "react";
import { createRoot } from "react-dom/client";

import { useEditorDocument, type EditorDocumentSession } from "../hooks/use-editor-document";
import type { EditorPersistenceAdapter, SaveRequest } from "../lib/document/editor-persistence";
import { paragraphValue } from "./test-utils";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

// useEditorDocument creates its controller with the browser's timers, so these
// tests use short real delays. A save that waits for the debounce is still unsaved
// at the first check and saved at the second.
function createAdapter() {
  const saves: SaveRequest[] = [];
  const adapter: EditorPersistenceAdapter = {
    load: async () => null,
    save: async (request) => {
      saves.push(request);
      return { status: "saved", revision: request.baseRevision + 1 };
    },
    saveRecovery: async () => undefined,
  };
  return { adapter, saves };
}

function Probe({
  adapter,
  debounceMs,
  seen,
}: {
  adapter: EditorPersistenceAdapter;
  debounceMs?: number;
  seen: EditorDocumentSession[];
}) {
  const session = useEditorDocument({ documentId: "debounce-doc", adapter, debounceMs });
  seen.push(session);
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

// Mounts the hook, makes one edit, and counts the saves that have started after
// `waitMs`. The edit is made once the document is ready.
async function savesAfterOneEdit(debounceMs: number | undefined, waitMs: number): Promise<number> {
  const { adapter, saves } = createAdapter();
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const seen: EditorDocumentSession[] = [];
  try {
    await act(async () => {
      root.render(<Probe adapter={adapter} debounceMs={debounceMs} seen={seen} />);
    });
    for (let attempt = 0; attempt < 50 && seen.at(-1)?.phase !== "ready"; attempt += 1) {
      await act(async () => {
        await sleep(5);
      });
    }
    const session = seen.at(-1);
    if (session?.phase !== "ready") {
      throw new Error("The document did not become ready.");
    }
    await act(async () => {
      session.onContentChange(paragraphValue("Hello"));
    });
    await act(async () => {
      await sleep(waitMs);
    });
    return saves.length;
  } finally {
    await act(async () => {
      root.unmount();
    });
    host.remove();
  }
}

describe("autosave debounce from the editor options", () => {
  test("a short debounce passed to the hook saves within the wait", async () => {
    expect(await savesAfterOneEdit(40, 300)).toBe(1);
  });

  test("a long debounce passed to the hook has not saved within the same wait", async () => {
    expect(await savesAfterOneEdit(5000, 300)).toBe(0);
  });

  test("no debounce keeps the default, which has not saved within the same wait", async () => {
    expect(await savesAfterOneEdit(undefined, 300)).toBe(0);
  });
});
