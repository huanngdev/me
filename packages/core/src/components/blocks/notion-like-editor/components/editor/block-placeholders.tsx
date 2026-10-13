import { useEffect, useRef } from "react";
import { ElementApi, KEYS, NodeApi, type Operation, type SlateEditor } from "platejs";

import { useEditorFlushes } from "../../hooks/use-editor-flushes";
import { FOOTNOTE_DEF_KEY } from "../../lib/document/editor-document-schema";
import { isTextOnlyBatch } from "../../lib/features/editor-operation-batch";
import { DEFAULT_PLACEHOLDER } from "../../lib/features/editor-placeholder";
import { useEditorReadOnly, useEditorRef, useEditorSelector } from "platejs/react";

const PLACEHOLDER_ATTR = "data-block-placeholder";
const PLACEHOLDER_INSET_VAR = "--block-placeholder-inset";

// The distance from the block's border-box left to where the text starts. A
// plain block is 0; a list item or to-do is offset by its marker/checkbox
// indent (the first child `<ul>`/`<ol>` padding).
function placeholderInset(block: HTMLElement): number {
  const first = block.firstElementChild;
  if (!(first instanceof HTMLElement)) {
    return 0;
  }
  const blockLeft = block.getBoundingClientRect().left;
  const style = getComputedStyle(first);
  const offset =
    first.getBoundingClientRect().left -
    blockLeft +
    (Number.parseFloat(style.paddingLeft) || 0) +
    (Number.parseFloat(style.marginLeft) || 0);
  return offset > 0 ? offset : 0;
}

// Block types that own an editable text line and can show a placeholder.
const PLACEHOLDER_TYPES = new Set<string>([
  KEYS.p,
  KEYS.h1,
  KEYS.h2,
  KEYS.h3,
  KEYS.codeLine,
  FOOTNOTE_DEF_KEY,
]);

const HEADING_TEXT: Record<string, string> = {
  [KEYS.h1]: "Heading 1",
  [KEYS.h2]: "Heading 2",
  [KEYS.h3]: "Heading 3",
};

export type Placement = { parentType: string | null; index: number };

function placementOf(editor: SlateEditor, path: readonly number[]): Placement {
  const index = path[path.length - 1] ?? 0;
  const parentPath = path.slice(0, -1);
  let parentType: string | null = null;
  if (parentPath.length > 0) {
    const parent = editor.api.node(parentPath);
    const node = parent?.[0];
    if (parent && ElementApi.isElement(node) && typeof node.type === "string") {
      parentType = node.type;
    }
  }
  return { parentType, index };
}

export type PlaceholderSpec = { text: string; always: boolean };

// The placeholder text for an empty block, and whether it shows whenever the
// block is empty (typed blocks with a role) or only while it holds the caret
// (a plain paragraph, so blank spacer lines stay clean).
export function placeholderSpec(
  node: Record<string, unknown>,
  placement: Placement,
  paragraphText: string,
): PlaceholderSpec | null {
  const type = typeof node.type === "string" ? node.type : "";
  if (!PLACEHOLDER_TYPES.has(type)) {
    return null;
  }
  if (NodeApi.string(node as never) !== "") {
    return null;
  }
  if (type === KEYS.h1 || type === KEYS.h2 || type === KEYS.h3) {
    return { text: HEADING_TEXT[type], always: true };
  }
  if (type === KEYS.codeLine) {
    return { text: "Code", always: true };
  }
  if (type === FOOTNOTE_DEF_KEY) {
    return { text: "Footnote", always: true };
  }
  const listStyle = typeof node.listStyleType === "string" ? node.listStyleType : null;
  if (listStyle === KEYS.listTodo) {
    return { text: "To-do", always: true };
  }
  if (listStyle !== null) {
    return { text: "List", always: true };
  }
  const { parentType, index } = placement;
  if (parentType === KEYS.callout && index === 0) {
    return { text: paragraphText, always: true };
  }
  if (parentType === KEYS.toggle && index === 0) {
    return { text: "Toggle", always: true };
  }
  if (parentType === KEYS.blockquote && index === 0) {
    return { text: "Quote", always: true };
  }
  // The first line inside a toggle body reads as the container's main line.
  if (parentType === KEYS.toggle && index === 1) {
    return { text: paragraphText, always: true };
  }
  return { text: paragraphText, always: false };
}

function placeholderFor(
  editor: SlateEditor,
  node: Record<string, unknown>,
  path: readonly number[],
  paragraphText: string,
): PlaceholderSpec | null {
  return placeholderSpec(node, placementOf(editor, path), paragraphText);
}

function editableOf(editor: SlateEditor): HTMLElement | null {
  const first = editor.children[0];
  if (!first || !ElementApi.isElement(first)) {
    return null;
  }
  const dom = editor.api.toDOMNode(first);
  const editable = dom?.closest("[data-slate-editor]");
  return editable instanceof HTMLElement ? editable : null;
}

function isSingleEmptyDocument(editor: SlateEditor): boolean {
  const first = editor.children[0];
  return (
    editor.children.length === 1 &&
    first !== undefined &&
    ElementApi.isElement(first) &&
    NodeApi.string(first) === ""
  );
}

// The elements a text-only batch can change: every ancestor of an edited text
// node. An edit alters only the empty state of those elements.
function textEditAncestors(operations: readonly Operation[]): number[][] {
  const paths: number[][] = [];
  for (const operation of operations) {
    if (operation.type !== "insert_text" && operation.type !== "remove_text") {
      continue;
    }
    for (let depth = 1; depth < operation.path.length; depth += 1) {
      paths.push(operation.path.slice(0, depth));
    }
  }
  return paths;
}

// Writes one element's placeholder state with the same rule as the full pass.
function placeholderAt(
  editor: SlateEditor,
  path: number[],
  placeholder: string,
  caret: string | null,
): void {
  const entry = editor.api.node(path);
  if (!entry || !ElementApi.isElement(entry[0])) {
    return;
  }
  const node = entry[0];
  const dom = editor.api.toDOMNode(node);
  if (!(dom instanceof HTMLElement)) {
    return;
  }
  dom.removeAttribute(PLACEHOLDER_ATTR);
  const info =
    typeof node.type === "string" && PLACEHOLDER_TYPES.has(node.type)
      ? placeholderFor(editor, node, path, placeholder)
      : null;
  if (!info || (!info.always && path.join(".") !== caret)) {
    return;
  }
  dom.setAttribute(PLACEHOLDER_ATTR, info.text);
  dom.style.setProperty(PLACEHOLDER_INSET_VAR, `${String(placeholderInset(dom))}px`);
}

// What the last pass left on the DOM. A text-only pass needs it to find the
// caret block the previous pass set its state from.
type PassState = {
  editable: HTMLElement;
  placeholder: string;
  readOnly: boolean;
  singleEmpty: boolean;
  caret: number[] | null;
};

// One mechanism for every empty editable block. It writes a data attribute and
// a single CSS rule renders the text, so nothing enters the document model.
// A full pass runs on mount, on a structural batch, on a placeholder or
// read-only change, and when the single-empty state flips. A text-only batch
// touches only the edited blocks and the previous and current caret blocks.
export function BlockPlaceholders({ placeholder = DEFAULT_PLACEHOLDER }: { placeholder?: string }) {
  const editor = useEditorRef();
  const readOnly = useEditorReadOnly();
  const { version, take } = useEditorFlushes();
  const selectionKey = useEditorSelector(
    (instance) => (instance.selection ? instance.selection.anchor.path.join(".") : ""),
    [],
  );
  const passRef = useRef<PassState | null>(null);

  useEffect(() => {
    const operations = take();
    const editable = editableOf(editor);
    if (!editable) {
      passRef.current = null;
      return;
    }
    const singleEmpty = isSingleEmptyDocument(editor);
    const caret = editor.selection ? editor.selection.anchor.path.slice(0, -1) : null;
    const caretKey = caret ? caret.join(".") : null;
    const previous = passRef.current;
    passRef.current = { editable, placeholder, readOnly, singleEmpty, caret };
    if (
      previous !== null &&
      previous.editable === editable &&
      previous.placeholder === placeholder &&
      !previous.readOnly &&
      !previous.singleEmpty &&
      !readOnly &&
      !singleEmpty &&
      isTextOnlyBatch(operations)
    ) {
      const touched = new Map<string, number[]>();
      for (const path of [
        ...textEditAncestors(operations),
        ...(previous.caret ? [previous.caret] : []),
        ...(caret ? [caret] : []),
      ]) {
        touched.set(path.join("."), path);
      }
      for (const path of touched.values()) {
        placeholderAt(editor, path, placeholder, caretKey);
      }
      return;
    }

    for (const node of editable.querySelectorAll(`[${PLACEHOLDER_ATTR}]`)) {
      node.removeAttribute(PLACEHOLDER_ATTR);
    }
    // The document-level placeholder (slate-react) covers a single empty block;
    // skip it here so the two do not stack.
    if (readOnly || singleEmpty) {
      return;
    }
    for (const [node, path] of editor.api.nodes({
      at: [],
      match: (candidate) =>
        ElementApi.isElement(candidate) &&
        typeof candidate.type === "string" &&
        PLACEHOLDER_TYPES.has(candidate.type),
    })) {
      if (!ElementApi.isElement(node)) {
        continue;
      }
      const info = placeholderFor(editor, node, path, placeholder);
      if (!info) {
        continue;
      }
      if (!info.always && path.join(".") !== caretKey) {
        continue;
      }
      const dom = editor.api.toDOMNode(node);
      if (dom instanceof HTMLElement) {
        dom.setAttribute(PLACEHOLDER_ATTR, info.text);
        // A list item's text starts after the marker/checkbox indent, not at the
        // block's left edge. Tell the ::before where the text begins.
        dom.style.setProperty(PLACEHOLDER_INSET_VAR, `${String(placeholderInset(dom))}px`);
      }
    }
  }, [editor, placeholder, readOnly, selectionKey, take, version]);

  return null;
}
