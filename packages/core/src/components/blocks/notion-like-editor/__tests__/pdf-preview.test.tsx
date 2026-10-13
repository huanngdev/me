import { afterEach, describe, expect, test } from "bun:test";

import { FILE_KEY } from "../lib/features/editor-file";
import {
  PDF_MIME,
  PDF_PREVIEW_MAX_BYTES,
  isPdfMime,
  loadPdfPreview,
  pdfViewerAvailable,
} from "../lib/features/editor-pdf-preview";
import {
  blockHost,
  click,
  find,
  mediaBlock,
  mount,
  paragraph,
  press,
  realClick,
  settle,
  snapshot,
  types,
  type Mounted,
} from "./media-block-helpers";
import { caret } from "./test-utils";

const PDF_LINK = "https://cdn.example.com/a.pdf";
const PDF_BYTES = new TextEncoder().encode("%PDF-1.4\n%%EOF\n");

function file(id: string, extra: Record<string, unknown> = {}) {
  return mediaBlock(FILE_KEY, id, extra);
}

// Replaces a global or property for one test. Every stub is restored in afterEach.
const restores: (() => void)[] = [];

function stub(target: object, key: string, value: unknown): void {
  const owned = Object.prototype.hasOwnProperty.call(target, key);
  const previous = Reflect.get(target, key);
  Object.defineProperty(target, key, { configurable: true, writable: true, value });
  restores.push(() => {
    if (owned) {
      Object.defineProperty(target, key, { configurable: true, writable: true, value: previous });
    } else {
      Reflect.deleteProperty(target, key);
    }
  });
}

afterEach(() => {
  for (const restore of restores.splice(0).reverse()) {
    restore();
  }
});

// undefined removes the property, the way a browser without a PDF viewer reports it.
function setViewer(enabled: boolean | undefined): void {
  stub(navigator, "pdfViewerEnabled", enabled);
  if (enabled === undefined) {
    Reflect.deleteProperty(navigator, "pdfViewerEnabled");
  }
}

// Each fetch is answered by the handler, and every requested url is recorded.
function stubFetch(handler: (url: string, init?: RequestInit) => Promise<Response>): string[] {
  const calls: string[] = [];
  stub(globalThis, "fetch", (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push(String(input));
    return handler(String(input), init);
  });
  return calls;
}

function pdfResponse(): Response {
  return new Response(PDF_BYTES, { headers: { "content-type": PDF_MIME } });
}

// Object URLs are fake strings, and the test records each one created and revoked.
function stubObjectUrls(): { created: Blob[]; revoked: string[] } {
  const created: Blob[] = [];
  const revoked: string[] = [];
  stub(URL, "createObjectURL", (blob: Blob) => {
    created.push(blob);
    return `blob:test/${created.length}`;
  });
  stub(URL, "revokeObjectURL", (url: string) => {
    revoked.push(url);
  });
  return { created, revoked };
}

function fileState(mounted: Mounted, id: string): string | null {
  return (
    blockHost(mounted.host, id)
      ?.querySelector("[data-file-state]")
      ?.getAttribute("data-file-state") ?? null
  );
}

async function openActionsOn(mounted: Mounted, id: string): Promise<void> {
  await realClick(blockHost(mounted.host, id)?.querySelector("[data-file-card]") ?? null);
}

async function openPreviewFromActions(mounted: Mounted, id: string): Promise<void> {
  await openActionsOn(mounted, id);
  await click(find('[data-file-action="preview"]'));
  await settle();
}

function dialog(): HTMLElement | null {
  return find('[role="dialog"]');
}

// A boolean, not the element, so a failed check prints one line and not the whole DOM.
function exists(element: Element | null | undefined): boolean {
  return element !== null && element !== undefined;
}

function iframes(): HTMLIFrameElement[] {
  return [...document.querySelectorAll<HTMLIFrameElement>("iframe")];
}

describe("loadPdfPreview", () => {
  test("valid PDF bytes with an empty type load, typed as a PDF", async () => {
    stubFetch(() => Promise.resolve(new Response(PDF_BYTES)));
    const result = await loadPdfPreview(PDF_LINK, new AbortController().signal);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.blob.type).toBe(PDF_MIME);
      expect(new Uint8Array(await result.blob.arrayBuffer())).toEqual(PDF_BYTES);
    }
  });

  test("HTML served as a PDF is not a PDF", async () => {
    stubFetch(() =>
      Promise.resolve(
        new Response("<!doctype html><script>alert(1)</script>", {
          headers: { "content-type": PDF_MIME },
        }),
      ),
    );
    expect(await loadPdfPreview(PDF_LINK, new AbortController().signal)).toEqual({
      ok: false,
      reason: "not-pdf",
    });
  });

  test("the signature must be inside the first 1024 bytes", async () => {
    const late = new Uint8Array(2000 + 5);
    late.set(new TextEncoder().encode("%PDF-"), 2000);
    stubFetch(() => Promise.resolve(new Response(late)));
    expect(await loadPdfPreview(PDF_LINK, new AbortController().signal)).toEqual({
      ok: false,
      reason: "not-pdf",
    });
  });

  test("a signature that ends exactly at byte 1024 still counts", async () => {
    const edge = new Uint8Array(1024);
    edge.set(new TextEncoder().encode("%PDF-"), 1019);
    stubFetch(() => Promise.resolve(new Response(edge)));
    const result = await loadPdfPreview(PDF_LINK, new AbortController().signal);
    expect(result.ok).toBe(true);
  });

  test("a body over the size limit is too large, without a copy of it", async () => {
    // The size is stubbed, so the test does not allocate the 50 MB limit.
    stubFetch(() =>
      Promise.resolve({
        ok: true,
        blob: () => Promise.resolve({ size: PDF_PREVIEW_MAX_BYTES + 1 }),
      } as unknown as Response),
    );
    expect(await loadPdfPreview(PDF_LINK, new AbortController().signal)).toEqual({
      ok: false,
      reason: "too-large",
    });
  });

  test("a rejected fetch and a 404 are network failures", async () => {
    stubFetch(() => Promise.reject(new TypeError("Failed to fetch")));
    expect(await loadPdfPreview(PDF_LINK, new AbortController().signal)).toEqual({
      ok: false,
      reason: "network",
    });

    stubFetch(() => Promise.resolve(new Response("missing", { status: 404 })));
    expect(await loadPdfPreview(PDF_LINK, new AbortController().signal)).toEqual({
      ok: false,
      reason: "network",
    });
  });

  test("an abort rejects with the abort error, and is not a result", async () => {
    stubFetch(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("The operation was aborted.", "AbortError"));
          });
        }),
    );
    const controller = new AbortController();
    const pending = loadPdfPreview(PDF_LINK, controller.signal);
    controller.abort();
    let thrown: unknown;
    try {
      await pending;
    } catch (error) {
      thrown = error;
    }
    expect(thrown instanceof DOMException ? thrown.name : undefined).toBe("AbortError");
  });
});

describe("pdf preview helpers", () => {
  test("only the exact application/pdf mime type is a PDF", () => {
    expect(isPdfMime(PDF_MIME)).toBe(true);
    expect(isPdfMime("text/plain")).toBe(false);
    expect(isPdfMime(undefined)).toBe(false);
  });

  test("the viewer is available only when navigator says so", () => {
    setViewer(true);
    expect(pdfViewerAvailable()).toBe(true);
    setViewer(false);
    expect(pdfViewerAvailable()).toBe(false);
    setViewer(undefined);
    expect(pdfViewerAvailable()).toBe(false);
  });
});

describe("pdf preview is offered", () => {
  test("only for a PDF mime, a ready url and the browser's viewer", async () => {
    setViewer(true);
    const mounted = await mount([
      paragraph("Before", "p1"),
      file("f1", { url: PDF_LINK, name: "a.pdf", mime: PDF_MIME }),
    ]);
    await settle();
    await openActionsOn(mounted, "f1");
    expect(exists(find('[data-file-action="preview"]'))).toBe(true);
    await mounted.cleanup();
  });

  test("a .pdf name with another or missing mime type gets no Preview", async () => {
    setViewer(true);
    const mounted = await mount([
      paragraph("Before", "p1"),
      file("f1", { url: PDF_LINK, name: "a.pdf", mime: "text/plain" }),
      file("f2", { url: PDF_LINK, name: "b.pdf" }),
    ]);
    await settle();
    await openActionsOn(mounted, "f1");
    expect(exists(find('[data-file-action="preview"]'))).toBe(false);
    await openActionsOn(mounted, "f2");
    expect(exists(find('[data-file-action="preview"]'))).toBe(false);
    await mounted.cleanup();
  });

  test("without the browser's viewer, the block has no Preview and keeps Download", async () => {
    for (const enabled of [false, undefined]) {
      setViewer(enabled);
      const mounted = await mount([
        paragraph("Before", "p1"),
        file("f1", { url: PDF_LINK, name: "a.pdf", mime: PDF_MIME }),
      ]);
      await settle();
      await openActionsOn(mounted, "f1");
      expect(exists(find('[data-file-action="preview"]'))).toBe(false);
      expect(exists(find('[data-file-action="download"]'))).toBe(true);
      await mounted.cleanup();
    }
  });

  test("the Preview control is the first action, before Download", async () => {
    setViewer(true);
    const mounted = await mount([
      paragraph("Before", "p1"),
      file("f1", { url: PDF_LINK, name: "a.pdf", mime: PDF_MIME }),
    ]);
    await settle();
    await openActionsOn(mounted, "f1");
    const row = find("[data-file-actions-row]");
    expect(row?.querySelector("[data-file-action]")?.getAttribute("data-file-action")).toBe(
      "preview",
    );
    expect(row?.querySelector('[data-file-action="preview"]')?.getAttribute("aria-label")).toBe(
      "Preview",
    );
    await mounted.cleanup();
  });
});

describe("pdf preview dialog", () => {
  test("nothing is fetched and no iframe exists until Preview is clicked", async () => {
    setViewer(true);
    stubObjectUrls();
    const calls = stubFetch(() => Promise.resolve(pdfResponse()));
    const mounted = await mount([
      paragraph("Before", "p1"),
      file("f1", { url: PDF_LINK, name: "a.pdf", mime: PDF_MIME }),
    ]);
    await settle();
    await openActionsOn(mounted, "f1");
    expect(calls).toEqual([]);
    expect(iframes().length).toBe(0);

    await click(find('[data-file-action="preview"]'));
    await settle();
    expect(calls).toEqual([PDF_LINK]);
    expect(iframes().length).toBe(1);
    await mounted.cleanup();
  });

  test("the iframe shows the object URL of the PDF, named after the file", async () => {
    setViewer(true);
    const urls = stubObjectUrls();
    stubFetch(() => Promise.resolve(pdfResponse()));
    const mounted = await mount([
      paragraph("Before", "p1"),
      file("f1", { url: PDF_LINK, name: "a.pdf", mime: PDF_MIME }),
    ]);
    await settle();
    await openPreviewFromActions(mounted, "f1");

    const frame = iframes()[0];
    expect(frame?.getAttribute("src")).toBe("blob:test/1");
    expect(frame?.getAttribute("title")).toBe("a.pdf");
    expect(frame?.hasAttribute("sandbox")).toBe(false);
    expect(urls.created.length).toBe(1);
    expect(urls.created[0]?.type).toBe(PDF_MIME);
    expect(dialog()?.textContent).toContain("a.pdf");
    expect(exists(find('[data-pdf-preview-state="ready"]'))).toBe(true);
    await mounted.cleanup();
  });

  test("closing revokes the object URL, removes the iframe, and changes no document state", async () => {
    setViewer(true);
    const urls = stubObjectUrls();
    stubFetch(() => Promise.resolve(pdfResponse()));
    const mounted = await mount([
      paragraph("Before", "p1"),
      file("f1", { url: PDF_LINK, name: "a.pdf", mime: PDF_MIME }),
    ]);
    await settle();
    const before = snapshot(mounted.editor);
    const undos = mounted.editor.history.undos.length;

    await openPreviewFromActions(mounted, "f1");
    const selection = mounted.editor.selection;
    await press(dialog(), "Escape");
    await settle();

    expect(exists(dialog())).toBe(false);
    expect(iframes().length).toBe(0);
    expect(urls.revoked).toEqual(["blob:test/1"]);
    expect(snapshot(mounted.editor)).toBe(before);
    expect(mounted.editor.history.undos.length).toBe(undos);
    expect(mounted.editor.selection).toEqual(selection);
    expect(types(mounted.editor)).toEqual(["p", FILE_KEY]);
    await mounted.cleanup();
  });

  test("a failed load shows the failed state, a Download link, and no iframe", async () => {
    setViewer(true);
    stubObjectUrls();
    stubFetch(() =>
      Promise.resolve(
        new Response("<html>not a pdf</html>", { headers: { "content-type": PDF_MIME } }),
      ),
    );
    const mounted = await mount([
      paragraph("Before", "p1"),
      file("f1", { url: PDF_LINK, name: "a.pdf", mime: PDF_MIME }),
    ]);
    await settle();
    await openPreviewFromActions(mounted, "f1");

    expect(find('[data-pdf-preview-state="failed"]')?.textContent).toContain(
      "This PDF can't be previewed.",
    );
    expect(iframes().length).toBe(0);
    const download = dialog()?.querySelector('[data-file-action="download"]');
    expect(download?.getAttribute("href")).toBe(PDF_LINK);
    await mounted.cleanup();
  });

  test("a key typed in the dialog does not reach the editor", async () => {
    setViewer(true);
    stubObjectUrls();
    stubFetch(() => Promise.resolve(pdfResponse()));
    const mounted = await mount([
      paragraph("Before", "p1"),
      file("f1", { url: PDF_LINK, name: "a.pdf", mime: PDF_MIME }),
    ]);
    await settle();
    // An edit gives the editor an undo step. Mod+Z in the dialog must not undo it.
    mounted.editor.tf.select(caret([0, 0], 6));
    mounted.editor.tf.insertText("!");
    const edited = snapshot(mounted.editor);
    const undos = mounted.editor.history.undos.length;

    // A document listener is the stand-in for the editor's own key listeners, and must not see the key.
    const seen: string[] = [];
    const listener = (event: Event) => {
      seen.push((event as KeyboardEvent).key);
    };
    document.addEventListener("keydown", listener);
    restores.push(() => {
      document.removeEventListener("keydown", listener);
    });

    await openPreviewFromActions(mounted, "f1");
    await press(dialog(), "z", { ctrlKey: true });

    expect(seen).toEqual([]);
    expect(snapshot(mounted.editor)).toBe(edited);
    expect(mounted.editor.history.undos.length).toBe(undos);
    expect(exists(dialog())).toBe(true);
    await mounted.cleanup();
  });
});

describe("pdf preview in read-only mode", () => {
  test("Preview sits next to the link, and opens the dialog without the actions popover", async () => {
    setViewer(true);
    stubObjectUrls();
    const calls = stubFetch(() => Promise.resolve(pdfResponse()));
    const mounted = await mount([file("f1", { url: PDF_LINK, name: "a.pdf", mime: PDF_MIME })], {
      readOnly: true,
    });
    await settle();
    const link = blockHost(mounted.host, "f1")?.querySelector("a");
    const preview = blockHost(mounted.host, "f1")?.querySelector('[data-file-action="preview"]');
    expect(link?.getAttribute("href")).toBe(PDF_LINK);
    expect(exists(preview)).toBe(true);
    expect(link?.contains(preview ?? null)).toBe(false);
    expect(exists(find("[data-file-actions]"))).toBe(false);
    expect(calls).toEqual([]);

    await click(preview ?? null);
    await settle();
    expect(calls).toEqual([PDF_LINK]);
    expect(iframes().length).toBe(1);
    expect(exists(find('[data-pdf-preview-state="ready"]'))).toBe(true);
    await mounted.cleanup();
  });

  test("closing the dialog returns focus to the Preview button that opened it", async () => {
    setViewer(true);
    stubObjectUrls();
    stubFetch(() => Promise.resolve(pdfResponse()));
    const mounted = await mount([file("f1", { url: PDF_LINK, name: "a.pdf", mime: PDF_MIME })], {
      readOnly: true,
    });
    await settle();
    const preview = blockHost(mounted.host, "f1")?.querySelector<HTMLButtonElement>(
      '[data-file-action="preview"]',
    );
    preview?.focus();
    await click(preview ?? null);
    await settle();
    expect(exists(dialog())).toBe(true);

    await press(dialog(), "Escape");
    await settle();
    expect(exists(dialog())).toBe(false);
    expect(document.activeElement === preview).toBe(true);
    await mounted.cleanup();
  });

  test("a read-only file without the viewer keeps only the link", async () => {
    setViewer(false);
    const mounted = await mount([file("f1", { url: PDF_LINK, name: "a.pdf", mime: PDF_MIME })], {
      readOnly: true,
    });
    await settle();
    expect(exists(blockHost(mounted.host, "f1")?.querySelector("a"))).toBe(true);
    expect(exists(find('[data-file-action="preview"]'))).toBe(false);
    expect(fileState(mounted, "f1")).toBe("ready");
    await mounted.cleanup();
  });
});
