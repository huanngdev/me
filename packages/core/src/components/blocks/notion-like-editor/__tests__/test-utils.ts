import { expect } from "bun:test";
import { createSlateEditor, type Descendant, type SlateEditor, type TRange } from "platejs";

import { parseHtml } from "../../../../../test/setup-dom";
import type { AutosaveTimers } from "../lib/document/editor-autosave";
import type { ParseResult } from "../lib/document/editor-document-validate";
import { createEditorPlugins } from "../lib/plugins/editor-plugins";
import { EMPTY_EDITOR_VALUE, type EditorValue } from "../lib/document/editor-value";

export function createEditor(value: EditorValue = EMPTY_EDITOR_VALUE): SlateEditor {
  return createSlateEditor({
    plugins: createEditorPlugins(),
    value,
  });
}

function isHtmlElement(value: unknown): value is HTMLElement {
  return (
    typeof value === "object" &&
    value !== null &&
    "nodeType" in value &&
    value.nodeType === 1 &&
    "childNodes" in value &&
    "style" in value
  );
}

// Plate compares nodeType to the global Node constants while it walks the element.
export function deserializeHtmlInDom(editor: SlateEditor, html: string): Descendant[] {
  const body: unknown = parseHtml(html);
  if (!isHtmlElement(body)) {
    throw new Error("The HTML parser did not return a body element.");
  }

  return editor.api.html.deserialize({ element: body });
}

export function texts(editor: SlateEditor): string[] {
  const lines: string[] = [];
  for (const block of editor.children) {
    let line = "";
    for (const child of block.children) {
      if ("text" in child && typeof child.text === "string") {
        line += child.text;
      }
    }
    lines.push(line);
  }
  return lines;
}

export function blockIds(editor: SlateEditor): string[] {
  const ids: string[] = [];
  for (const block of editor.children) {
    if ("id" in block && typeof block.id === "string") {
      ids.push(block.id);
    }
  }
  return ids;
}

export function plainText(editor: SlateEditor): string {
  return texts(editor).join("");
}

export function caret(path: number[], offset: number): TRange {
  return {
    anchor: { path, offset },
    focus: { path, offset },
  };
}

export function textRange(path: number[], start: number, end: number): TRange {
  return {
    anchor: { path, offset: start },
    focus: { path, offset: end },
  };
}

export function paragraphValue(text: string, id = "block-1"): EditorValue {
  return [{ type: "p", id, children: [{ text }] }];
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function field(node: unknown, key: string): unknown {
  if (!isRecord(node) || !(key in node)) {
    return undefined;
  }

  return node[key];
}

export function expectOk(result: ParseResult): Extract<ParseResult, { status: "ok" }> {
  expect(result.status).toBe("ok");
  if (result.status !== "ok") {
    throw new Error("Expected a valid document.");
  }

  return result;
}

export function expectInvalid(result: ParseResult): Extract<ParseResult, { status: "invalid" }> {
  expect(result.status).toBe("invalid");
  if (result.status !== "invalid") {
    throw new Error("Expected an invalid document.");
  }

  return result;
}

export function expectUnsupported(
  result: ParseResult,
): Extract<ParseResult, { status: "unsupported" }> {
  expect(result.status).toBe("unsupported");
  if (result.status !== "unsupported") {
    throw new Error("Expected an unsupported document.");
  }

  return result;
}

export function expectFuture(
  result: ParseResult,
): Extract<ParseResult, { status: "future-version" }> {
  expect(result.status).toBe("future-version");
  if (result.status !== "future-version") {
    throw new Error("Expected a future-version document.");
  }

  return result;
}

export function createFakeTimers() {
  let now = 0;
  let nextId = 1;
  const entries: Array<{ id: number; at: number; callback: () => void }> = [];

  const timers: AutosaveTimers = {
    setTimeout: (callback, delayMs) => {
      const id = nextId;
      nextId += 1;
      entries.push({ id, at: now + delayMs, callback });
      return id;
    },
    clearTimeout: (id) => {
      const index = entries.findIndex((entry) => entry.id === id);
      if (index >= 0) {
        entries.splice(index, 1);
      }
    },
  };

  function advance(ms: number): void {
    now += ms;
    for (;;) {
      let nextIndex = -1;
      for (let index = 0; index < entries.length; index += 1) {
        const entry = entries[index];
        if (!entry || entry.at > now) {
          continue;
        }

        if (nextIndex === -1) {
          nextIndex = index;
          continue;
        }

        const current = entries[nextIndex];
        if (
          !current ||
          entry.at < current.at ||
          (entry.at === current.at && entry.id < current.id)
        ) {
          nextIndex = index;
        }
      }

      const next = nextIndex >= 0 ? entries[nextIndex] : undefined;
      if (!next || nextIndex < 0) {
        return;
      }

      entries.splice(nextIndex, 1);
      next.callback();
    }
  }

  return { timers, advance, pending: () => entries.length };
}

export function controllable<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
} {
  let resolvePromise: (value: T) => void = () => undefined;
  let rejectPromise: (reason?: unknown) => void = () => undefined;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });

  return {
    promise,
    resolve: resolvePromise,
    reject: rejectPromise,
  };
}

export function createMemoryStorage(options?: {
  throwOnGet?: unknown;
  throwOnSet?: unknown;
}): Storage {
  const values = new Map<string, string>();

  return {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key) {
      if (options?.throwOnGet) {
        throw options.throwOnGet;
      }

      return values.get(key) ?? null;
    },
    key(index) {
      return [...values.keys()][index] ?? null;
    },
    removeItem(key) {
      values.delete(key);
    },
    setItem(key, value) {
      if (options?.throwOnSet) {
        throw options.throwOnSet;
      }

      values.set(key, value);
    },
  };
}
