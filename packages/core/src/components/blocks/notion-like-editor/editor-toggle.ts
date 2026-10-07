import {
  ElementApi,
  KEYS,
  PathApi,
  TextApi,
  createSlatePlugin,
  type Descendant,
  type SlateEditor,
  type TElement,
} from "platejs";

import { allowsFirstChild } from "./editor-document-schema";

// Own container, not @platejs/toggle: its flat indent model collides with indent → listStyleType.
// No shortcut. The "> " trigger is DEV-126.
export const togglePlugin = createSlatePlugin({
  key: KEYS.toggle,
  node: { isElement: true },
  options: {
    openIds: new Set<string>(),
  },
  parsers: {
    html: {
      deserializer: {
        rules: [{ validNodeName: "DETAILS" }],
        parse: ({ editor, element, type }) => parseDetails(editor, element, type),
      },
    },
  },
});

type LabelContext = {
  id: string;
  labelPath: number[];
  togglePath: number[];
};

function isHtmlElementNode(value: unknown): value is HTMLElement {
  return (
    typeof value === "object" &&
    value !== null &&
    "nodeType" in value &&
    value.nodeType === 1 &&
    "nodeName" in value &&
    "childNodes" in value
  );
}

function nodeText(node: unknown): string {
  if (!node || typeof node !== "object") {
    return "";
  }

  if ("text" in node && typeof node.text === "string" && !("children" in node)) {
    return node.text;
  }

  if (!("children" in node) || !Array.isArray(node.children)) {
    return "";
  }

  return node.children.map((child: unknown) => nodeText(child)).join("");
}

function isDescendant(value: unknown): value is Descendant {
  return TextApi.isText(value) || ElementApi.isElement(value);
}

// deserialize() normalizes a document fragment. A non-body element comes back as one
// node, so wrap the element in a body first. Plate only returns an array for that.
function deserializedNodes(editor: SlateEditor, element: HTMLElement): Descendant[] {
  const body = element.ownerDocument.createElement("body");
  body.append(element.cloneNode(true));
  const parsed: unknown = editor.api.html.deserialize({ element: body });
  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed.filter(isDescendant);
}

function isToggleHeading(type: string): boolean {
  return type !== KEYS.p && allowsFirstChild(KEYS.toggle, type);
}

// Plate may wrap <summary><h2> in a paragraph. A summary is a heading label only
// when that heading is the only content.
function summaryHeading(nodes: readonly Descendant[]): TElement | undefined {
  let heading: TElement | undefined;
  let extra = false;

  const visit = (node: Descendant): void => {
    if (extra) {
      return;
    }

    if (TextApi.isText(node)) {
      if (node.text.trim().length > 0) {
        extra = true;
      }
      return;
    }

    if (!ElementApi.isElement(node)) {
      return;
    }

    if (isToggleHeading(node.type)) {
      if (heading !== undefined) {
        extra = true;
        return;
      }

      heading = node;
      return;
    }

    for (const child of node.children) {
      if (TextApi.isText(child) || ElementApi.isElement(child)) {
        visit(child);
      }
    }
  };

  for (const node of nodes) {
    visit(node);
  }

  return extra ? undefined : heading;
}

function summaryLabel(editor: SlateEditor, summary: HTMLElement): TElement {
  const heading = summaryHeading(deserializedNodes(editor, summary));
  if (heading !== undefined) {
    return heading;
  }

  return { type: KEYS.p, children: labelInlines(editor, summary) };
}

function textLeaves(node: TElement): Descendant[] {
  const leaves: Descendant[] = [];
  for (const child of node.children) {
    if (TextApi.isText(child)) {
      leaves.push(child);
      continue;
    }

    if (ElementApi.isElement(child)) {
      leaves.push(...textLeaves(child));
    }
  }

  return leaves;
}

function labelInlines(editor: SlateEditor, summary: HTMLElement): Descendant[] {
  const inlines: Descendant[] = [];
  for (const node of deserializedNodes(editor, summary)) {
    if (TextApi.isText(node)) {
      inlines.push(node);
      continue;
    }

    if (!ElementApi.isElement(node)) {
      continue;
    }

    if (node.type === KEYS.p) {
      for (const child of node.children) {
        if (
          ElementApi.isElement(child) &&
          (child.type === KEYS.p || allowsFirstChild(KEYS.toggle, child.type))
        ) {
          inlines.push(...textLeaves(child));
          continue;
        }

        inlines.push(child);
      }
      continue;
    }

    const text = nodeText(node);
    if (text.length > 0) {
      inlines.push({ text });
    }
  }

  return inlines.length > 0 ? inlines : [{ text: "" }];
}

function contentBlocks(editor: SlateEditor, node: ChildNode): TElement[] {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent ?? "";
    if (text.trim().length === 0) {
      return [];
    }

    return [{ type: KEYS.p, children: [{ text }] }];
  }

  if (!isHtmlElementNode(node)) {
    return [];
  }

  const blocks: TElement[] = [];
  for (const child of deserializedNodes(editor, node)) {
    if (ElementApi.isElement(child)) {
      blocks.push(child);
      continue;
    }

    if (TextApi.isText(child) && child.text.length > 0) {
      blocks.push({ type: KEYS.p, children: [child] });
    }
  }

  return blocks;
}

// SUMMARY is the label. Without one, the label is an empty paragraph and the
// rest stays content. The container sanitizer then enforces the nesting cap.
function parseDetails(editor: SlateEditor, element: HTMLElement, type: string): TElement {
  let summary: HTMLElement | undefined;
  const rest: ChildNode[] = [];
  for (const child of element.childNodes) {
    if (summary === undefined && isHtmlElementNode(child) && child.nodeName === "SUMMARY") {
      summary = child;
      continue;
    }

    rest.push(child);
  }

  const label = summary
    ? summaryLabel(editor, summary)
    : { type: KEYS.p, children: [{ text: "" }] };
  const content = rest.flatMap((child) => contentBlocks(editor, child));

  return {
    type,
    children: [label, ...content],
  };
}

export function readToggleOpenIds(editor: SlateEditor): Set<string> {
  const value: unknown = editor.getOption(togglePlugin, "openIds");
  if (!(value instanceof Set)) {
    return new Set();
  }

  const ids = new Set<string>();
  for (const id of value) {
    if (typeof id === "string" && id.length > 0) {
      ids.add(id);
    }
  }

  return ids;
}

function writeToggleOpenIds(editor: SlateEditor, ids: Set<string>): void {
  editor.setOption(togglePlugin, "openIds", ids);
}

function findToggle(editor: SlateEditor, id: string): [TElement, number[]] | undefined {
  for (const [node, path] of editor.api.nodes({
    at: [],
    match: (candidate) =>
      ElementApi.isElement(candidate) && candidate.type === KEYS.toggle && candidate.id === id,
  })) {
    if (ElementApi.isElement(node)) {
      return [node, path];
    }
  }

  return undefined;
}

function pathInside(parent: readonly number[], path: readonly number[]): boolean {
  if (path.length <= parent.length) {
    return false;
  }

  return parent.every((step, index) => path[index] === step);
}

function moveSelectionToLabelEnd(editor: SlateEditor, id: string): void {
  const selection = editor.selection;
  const entry = selection ? findToggle(editor, id) : undefined;
  if (!selection || !entry) {
    return;
  }

  const togglePath = entry[1];
  const focus = selection.focus.path;
  if (!pathInside(togglePath, focus)) {
    return;
  }

  const childIndex = focus[togglePath.length];
  if (childIndex === undefined || childIndex === 0) {
    return;
  }

  const end = editor.api.end(togglePath.concat(0));
  if (!end) {
    return;
  }

  editor.tf.withoutSaving(() => {
    editor.tf.select(end);
  });
}

export function toggleOpen(editor: SlateEditor, id: string, open?: boolean): void {
  const current = readToggleOpenIds(editor);
  const isOpen = current.has(id);
  const nextOpen = open ?? !isOpen;
  if (nextOpen === isOpen) {
    return;
  }

  if (!nextOpen) {
    moveSelectionToLabelEnd(editor, id);
  }

  const next = new Set(current);
  if (nextOpen) {
    next.add(id);
  } else {
    next.delete(id);
  }

  writeToggleOpenIds(editor, next);
}

export function openAncestorToggle(editor: SlateEditor): void {
  const entry = editor.api.above({
    match: (node) => ElementApi.isElement(node) && node.type === KEYS.toggle,
  });
  if (!entry || !ElementApi.isElement(entry[0]) || typeof entry[0].id !== "string") {
    return;
  }

  if (entry[0].id.length === 0) {
    return;
  }

  toggleOpen(editor, entry[0].id, true);
}

// Selection that lands in hidden content opens that toggle. Slate flushes editor.onChange
// in a microtask after select, undo, paste, and programmatic selection changes.
export function revealClosedToggleContent(editor: SlateEditor): void {
  const selection = editor.selection;
  if (!selection) {
    return;
  }

  const next = readToggleOpenIds(editor);
  let path = selection.focus.path;
  let changed = false;
  while (path.length > 1) {
    const index = path[path.length - 1];
    path = path.slice(0, -1);
    if (index === undefined || index === 0) {
      continue;
    }

    const parent = editor.api.node(path);
    if (!parent || !ElementApi.isElement(parent[0]) || parent[0].type !== KEYS.toggle) {
      continue;
    }

    const id = parent[0].id;
    if (typeof id !== "string" || id.length === 0 || next.has(id)) {
      continue;
    }

    next.add(id);
    changed = true;
  }

  if (changed) {
    writeToggleOpenIds(editor, next);
  }
}

function isEditorOnChange(value: unknown): value is (options?: { operation?: unknown }) => void {
  return typeof value === "function";
}

export function installToggleOnChange(editor: SlateEditor): void {
  const onChange = editor.onChange;
  if (!isEditorOnChange(onChange)) {
    return;
  }

  editor.onChange = (options?: { operation?: unknown }) => {
    onChange(options);
    revealClosedToggleContent(editor);
  };
}

function labelContext(editor: SlateEditor): LabelContext | undefined {
  if (!editor.selection || !editor.api.isCollapsed()) {
    return undefined;
  }

  const block = editor.api.block();
  if (
    !block ||
    !ElementApi.isElement(block[0]) ||
    typeof block[0].type !== "string" ||
    !allowsFirstChild(KEYS.toggle, block[0].type) ||
    typeof block[0].listStyleType === "string" ||
    block[1][block[1].length - 1] !== 0
  ) {
    return undefined;
  }

  const parent = editor.api.parent(block[1]);
  if (
    !parent ||
    !ElementApi.isElement(parent[0]) ||
    parent[0].type !== KEYS.toggle ||
    typeof parent[0].id !== "string" ||
    parent[0].id.length === 0
  ) {
    return undefined;
  }

  return { id: parent[0].id, labelPath: block[1], togglePath: parent[1] };
}

function moveSplitAfterToggle(editor: SlateEditor, togglePath: number[]): void {
  const createdPath = togglePath.concat(1);
  const destination = PathApi.next(togglePath);
  if (!destination || !editor.api.node(createdPath)) {
    return;
  }

  editor.tf.moveNodes({ at: createdPath, to: destination });
  const start = editor.api.start(destination);
  if (start) {
    editor.tf.select(start);
  }
}

export function breakToggleLabel(editor: SlateEditor, insertBreak: () => void): boolean {
  const label = labelContext(editor);
  if (!label) {
    return false;
  }

  const atStart = editor.api.isAt({ start: true });
  const empty = editor.selection !== null && editor.api.isEmpty(editor.selection, { block: true });
  if ((atStart && !empty) || readToggleOpenIds(editor).has(label.id)) {
    return false;
  }

  insertBreak();
  moveSplitAfterToggle(editor, label.togglePath);
  return true;
}

export function backspaceToggleLabel(editor: SlateEditor): boolean {
  const label = labelContext(editor);
  if (!label || !editor.api.isAt({ start: true })) {
    return false;
  }

  const togglePath = label.togglePath;
  editor.tf.unwrapNodes({
    at: togglePath,
    match: (_node, path) => PathApi.equals(path, togglePath),
  });
  const start = editor.api.start(togglePath);
  if (start) {
    editor.tf.select(start);
  }

  return true;
}

export function collectToggleIds(editor: SlateEditor): Set<string> {
  const ids = new Set<string>();
  for (const [node] of editor.api.nodes({
    at: [],
    match: (candidate) => ElementApi.isElement(candidate) && candidate.type === KEYS.toggle,
  })) {
    if (ElementApi.isElement(node) && typeof node.id === "string" && node.id.length > 0) {
      ids.add(node.id);
    }
  }

  return ids;
}

export function openNewToggles(editor: SlateEditor, before: ReadonlySet<string>): void {
  const next = readToggleOpenIds(editor);
  let changed = false;
  for (const id of collectToggleIds(editor)) {
    if (before.has(id) || next.has(id)) {
      continue;
    }

    next.add(id);
    changed = true;
  }

  if (changed) {
    writeToggleOpenIds(editor, next);
  }
}
