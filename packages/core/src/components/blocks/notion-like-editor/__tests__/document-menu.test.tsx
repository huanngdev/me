import { describe, expect, test } from "bun:test";
import { KEYS, type SlateEditor, type TElement } from "platejs";
import { createPlateEditor } from "platejs/react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { EditorSurface } from "../components/editor/editor-surface";
import type { EditorValue } from "../lib/document/editor-value";
import { exportEditorDocument } from "../lib/io/export-document";
import { createEditorPlugins } from "../lib/plugins/editor-plugins";
import { caret, plainText } from "./test-utils";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

function paragraph(id: string, text: string): TElement {
  return { type: KEYS.p, id, children: [{ text }] };
}

const SAMPLE: EditorValue = [paragraph("block-1", "First"), paragraph("block-2", "Second")];

function isReactContainer(value: object): value is Parameters<typeof createRoot>[0] {
  return "nodeType" in value && value.nodeType === 1;
}

async function mount(readOnly: boolean, value: EditorValue = SAMPLE) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const editor = createPlateEditor({ plugins: createEditorPlugins(), value });
  if (!isReactContainer(host)) {
    throw new Error("Missing mount node.");
  }
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <EditorSurface editor={editor} readOnly={readOnly} placeholder="" className="editor" />,
    );
  });
  return { host, editor, root };
}

async function unmount(mounted: { host: HTMLElement; root: Root }): Promise<void> {
  await act(async () => {
    mounted.root.unmount();
  });
  mounted.host.remove();
}

async function waitFor(check: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (check()) {
      return;
    }
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
    });
  }
  throw new Error("Timed out waiting for the document menu.");
}

function triggerOf(): HTMLElement {
  const trigger = document.querySelector<HTMLElement>("[aria-label='Document options']");
  if (!trigger) {
    throw new Error("Missing the document options trigger.");
  }
  return trigger;
}

async function openMenu(): Promise<void> {
  await act(async () => {
    triggerOf().dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, cancelable: true, button: 0 }),
    );
  });
}

function itemOf(action: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-document-action='${action}']`);
}

async function choose(action: string): Promise<void> {
  const item = itemOf(action);
  if (!item) {
    throw new Error(`Missing menu item ${action}.`);
  }
  await act(async () => {
    item.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
}

function dialogOf(mode: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-document-dialog='${mode}']`);
}

function dialogButton(mode: string, label: string): HTMLButtonElement {
  const button = [...(dialogOf(mode)?.querySelectorAll("button") ?? [])].find(
    (candidate) => (candidate.textContent ?? "").trim() === label,
  );
  if (!button) {
    throw new Error(`Missing dialog button ${label}.`);
  }
  return button;
}

async function clickDialogButton(mode: string, label: string): Promise<void> {
  const button = dialogButton(mode, label);
  await act(async () => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
}

async function pickFile(file: File): Promise<void> {
  const input = document.querySelector<HTMLInputElement>("[data-document-import-input]");
  if (!input) {
    throw new Error("Missing the import input.");
  }
  Object.defineProperty(input, "files", { configurable: true, value: [file] });
  await act(async () => {
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

function stubObjectUrls(): {
  created: Blob[];
  revoked: string[];
  restore: () => void;
} {
  const created: Blob[] = [];
  const revoked: string[] = [];
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  URL.createObjectURL = (object: Blob | MediaSource) => {
    if (object instanceof Blob) {
      created.push(object);
    }
    return `blob:test-${String(created.length)}`;
  };
  URL.revokeObjectURL = (url: string) => {
    revoked.push(url);
  };
  return {
    created,
    revoked,
    restore: () => {
      URL.createObjectURL = originalCreate;
      URL.revokeObjectURL = originalRevoke;
    },
  };
}

function snapshot(editor: SlateEditor): {
  children: SlateEditor["children"];
  undos: number;
  selection: SlateEditor["selection"];
} {
  return {
    children: editor.children,
    undos: editor.history.undos.length,
    selection: editor.selection,
  };
}

describe("document menu", () => {
  test("the trigger lists the export formats and import in an editable editor", async () => {
    const mounted = await mount(false);
    try {
      await openMenu();
      expect(triggerOf().getAttribute("aria-label")).toBe("Document options");
      expect(itemOf("export-json")?.textContent).toContain("JSON");
      expect(itemOf("export-html")?.textContent).toContain("HTML");
      expect(itemOf("export-markdown")?.textContent).toContain("Markdown");
      expect(itemOf("import")?.textContent).toContain("Import");
    } finally {
      await unmount(mounted);
    }
  });

  test("read-only keeps the export formats and drops import", async () => {
    const mounted = await mount(true);
    try {
      await openMenu();
      expect(itemOf("export-json")).not.toBeNull();
      expect(itemOf("export-html")).not.toBeNull();
      expect(itemOf("export-markdown")).not.toBeNull();
      expect(itemOf("import")).toBeNull();
    } finally {
      await unmount(mounted);
    }
  });

  test("export JSON downloads one file and leaves the document, history and selection alone", async () => {
    const urls = stubObjectUrls();
    const mounted = await mount(false);
    try {
      mounted.editor.tf.select(caret([0, 0], 2));
      const before = snapshot(mounted.editor);
      await openMenu();
      await choose("export-json");
      await waitFor(() => urls.created.length === 1);

      expect(urls.created.length).toBe(1);
      expect(urls.created[0]?.type.startsWith("application/json")).toBe(true);
      const exported = await urls.created[0]?.text();
      expect(exported).toContain("Second");
      expect(snapshot(mounted.editor)).toEqual(before);
    } finally {
      await unmount(mounted);
      urls.restore();
    }
  });

  test("a valid JSON import shows the confirm, cancel keeps everything, replace undoes", async () => {
    const urls = stubObjectUrls();
    const mounted = await mount(false);
    try {
      const replacement: EditorValue = [paragraph("new-1", "Imported text")];
      const exported = await exportEditorDocument(replacement, "json");
      const file = new File([exported.content], "notes.json", { type: "application/json" });

      await openMenu();
      await choose("import");
      await pickFile(file);
      await waitFor(() => dialogOf("import") !== null);
      expect(dialogOf("import")?.textContent).toContain("notes.json");
      expect(dialogOf("import")?.textContent).toContain("1 block");

      const beforeCancel = snapshot(mounted.editor);
      await clickDialogButton("import", "Cancel");
      expect(dialogOf("import")).toBeNull();
      expect(mounted.editor.children).toBe(beforeCancel.children);
      expect(mounted.editor.history.undos.length).toBe(beforeCancel.undos);

      await openMenu();
      await choose("import");
      await pickFile(file);
      await waitFor(() => dialogOf("import") !== null);
      await clickDialogButton("import", "Replace document");
      expect(plainText(mounted.editor)).toBe("Imported text");
      expect(mounted.editor.history.undos.length).toBe(beforeCancel.undos + 1);

      mounted.editor.tf.undo();
      expect(plainText(mounted.editor)).toBe("FirstSecond");
    } finally {
      await unmount(mounted);
      urls.restore();
    }
  });

  test("a .txt file and invalid JSON each show an error and leave the document unchanged", async () => {
    const mounted = await mount(false);
    try {
      const before = snapshot(mounted.editor);

      await openMenu();
      await choose("import");
      await pickFile(new File(["hello"], "notes.txt", { type: "text/plain" }));
      await waitFor(() => dialogOf("error") !== null);
      expect(dialogOf("error")?.textContent).toContain("Only .json, .html and .md files");
      await clickDialogButton("error", "Close");
      expect(dialogOf("error")).toBeNull();
      expect(mounted.editor.children).toBe(before.children);

      await openMenu();
      await choose("import");
      await pickFile(new File(["{not json"], "broken.json", { type: "application/json" }));
      await waitFor(() => dialogOf("error") !== null);
      await clickDialogButton("error", "Close");
      expect(mounted.editor.children).toBe(before.children);
      expect(mounted.editor.history.undos.length).toBe(before.undos);
    } finally {
      await unmount(mounted);
    }
  });
});
