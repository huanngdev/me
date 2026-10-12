import { KEYS, type SlateEditor, type TElement } from "platejs";

import { createEditorDocument } from "../lib/document/editor-document";
import { parseEditorDocument } from "../lib/document/editor-document-validate";
import { FOOTNOTE_DEF_KEY, FOOTNOTE_REF_KEY } from "../lib/document/editor-document-schema";
import type { EditorValue } from "../lib/document/editor-value";
import { expectOk } from "./test-utils";

// Shared builders for the footnote tests. Values are raw documents, not editor state.
export function para(id: string, children: unknown[]): EditorValue[number] {
  return { type: KEYS.p, id, children } as unknown as EditorValue[number];
}

export function text(value: string): unknown {
  return { text: value };
}

export function ref(id: string, footnoteId: string): unknown {
  return { type: FOOTNOTE_REF_KEY, id, footnoteId, children: [{ text: "" }] };
}

export function def(id: string, footnoteId: string, value = ""): unknown {
  return { type: FOOTNOTE_DEF_KEY, id, footnoteId, children: [{ text: value }] };
}

export function parse(value: EditorValue) {
  return parseEditorDocument(createEditorDocument("document", value));
}

export function nodesOfType(value: unknown, type: string): TElement[] {
  const found: TElement[] = [];
  const visit = (node: unknown): void => {
    if (typeof node !== "object" || node === null) {
      return;
    }
    if ("type" in node && node.type === type) {
      found.push(node as TElement);
    }
    if ("children" in node && Array.isArray(node.children)) {
      node.children.forEach(visit);
    }
  };
  if (Array.isArray(value)) {
    value.forEach(visit);
  } else {
    visit(value);
  }
  return found;
}

export function refsOf(editor: SlateEditor): TElement[] {
  return nodesOfType(editor.children, FOOTNOTE_REF_KEY);
}

export function defsOf(editor: SlateEditor): TElement[] {
  return nodesOfType(editor.children, FOOTNOTE_DEF_KEY);
}

// Text of every leaf, so a value split across siblings compares as one string.
export function allText(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map((child) => allText(child)).join("");
  }
  if (typeof value !== "object" || value === null) {
    return "";
  }
  if ("text" in value && typeof value.text === "string") {
    return value.text;
  }
  if ("children" in value && Array.isArray(value.children)) {
    return value.children.map((child) => allText(child)).join("");
  }
  return "";
}

export function repairMessages(result: ReturnType<typeof parse>): string[] {
  return expectOk(result).repairs.map((repair) => repair.message);
}

export function table(id: string, cells: unknown[][]): unknown {
  return {
    type: KEYS.table,
    id,
    children: cells.map((row, rowIndex) => ({
      type: KEYS.tr,
      id: `${id}-r${rowIndex}`,
      children: row.map((cell, cellIndex) => ({
        type: KEYS.td,
        id: `${id}-r${rowIndex}-c${cellIndex}`,
        children: [cell],
      })),
    })),
  };
}

export function toggle(id: string, label: string, body: unknown[]): unknown {
  return {
    type: KEYS.toggle,
    id,
    children: [{ type: KEYS.p, id: `${id}-label`, children: [{ text: label }] }, ...body],
  };
}
