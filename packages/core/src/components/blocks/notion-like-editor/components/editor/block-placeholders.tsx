import { useEffect } from "react";
import { ElementApi, KEYS, NodeApi, type SlateEditor } from "platejs";
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
const PLACEHOLDER_TYPES = new Set<string>([KEYS.p, KEYS.h1, KEYS.h2, KEYS.h3, KEYS.codeLine]);

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

// One mechanism for every empty editable block. It writes a data attribute and
// a single CSS rule renders the text, so nothing enters the document model.
export function BlockPlaceholders({ placeholder = "Type something…" }: { placeholder?: string }) {
  const editor = useEditorRef();
  const readOnly = useEditorReadOnly();
  const opCount = useEditorSelector((instance) => instance.operations.length, []);
  const selectionKey = useEditorSelector(
    (instance) => (instance.selection ? instance.selection.anchor.path.join(".") : ""),
    [],
  );

  useEffect(() => {
    const editable = editableOf(editor);
    if (!editable) {
      return;
    }
    for (const node of editable.querySelectorAll(`[${PLACEHOLDER_ATTR}]`)) {
      node.removeAttribute(PLACEHOLDER_ATTR);
    }
    // The document-level placeholder (slate-react) covers a single empty block;
    // skip it here so the two do not stack.
    if (readOnly || isSingleEmptyDocument(editor)) {
      return;
    }
    const caret = editor.selection ? editor.selection.anchor.path.slice(0, -1).join(".") : null;
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
      if (!info.always && path.join(".") !== caret) {
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
  }, [editor, opCount, placeholder, readOnly, selectionKey]);

  return null;
}
