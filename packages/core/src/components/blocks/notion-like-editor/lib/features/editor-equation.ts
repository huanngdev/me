import {
  ElementApi,
  KEYS,
  PathApi,
  createSlatePlugin,
  nanoid,
  type SlateEditor,
  type TElement,
} from "platejs";
import type { KatexOptions } from "katex";

import type { EditorCommand } from "../commands/editor-commands";

export const EQUATION_EMPTY_PLACEHOLDER = "Add an equation";

// throwOnError is true so a bad expression throws and this editor shows the
// message. KaTeX's false setting would emit its own katex-error span instead.
// strict is "ignore", not "warn": "warn" writes to the page console, and a
// parse error still throws. trust stays false, so \href, \url, \htmlClass,
// \htmlId, \htmlStyle, \htmlData, and \includegraphics cannot add links,
// attributes, or images (katex src/functions/href.js, html.js, includegraphics.js).
// No macros option: a stored document cannot define macros.
export const EQUATION_KATEX_OPTIONS = {
  displayMode: true,
  throwOnError: true,
  trust: false,
  strict: "ignore",
  maxSize: 10,
  maxExpand: 1000,
  output: "htmlAndMathml",
} as const satisfies KatexOptions;

type KatexModule = {
  renderToString: (expression: string, options: KatexOptions) => string;
};

export type EquationRender = { ok: true; html: string } | { ok: false; message: string };

let katexModule: Promise<KatexModule> | undefined;

// The public @platejs/math entries import katex statically. Loading it on the
// first equation keeps that library off the first paint.
export function loadKatex(): Promise<KatexModule> {
  katexModule ??= import("katex").then((mod) => mod.default);
  return katexModule;
}

export function renderEquation(katex: KatexModule, expression: string): EquationRender {
  try {
    return { ok: true, html: katex.renderToString(expression, EQUATION_KATEX_OPTIONS) };
  } catch (error) {
    const message = error instanceof Error ? error.message : "This equation could not be rendered.";
    return { ok: false, message };
  }
}

// The native plugin is not registered: its react entry imports katex statically, which would put KaTeX in the first-load bundle.
export const equationPlugin = createSlatePlugin({
  key: KEYS.equation,
  node: { isElement: true, isVoid: true },
  options: { editingId: "" },
});

export function equationEditingId(editor: SlateEditor): string {
  const value: unknown = editor.getOption(equationPlugin, "editingId");
  return typeof value === "string" ? value : "";
}

export function openEquationEditor(editor: SlateEditor, id: string): void {
  editor.setOption(equationPlugin, "editingId", id);
}

export function closeEquationEditor(editor: SlateEditor): void {
  if (equationEditingId(editor).length === 0) {
    return;
  }
  editor.setOption(equationPlugin, "editingId", "");
}

type EquationKeyEvent = {
  key: string;
  shiftKey: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  defaultPrevented: boolean;
  preventDefault: () => void;
};

// Enter on the selected void opens the editor. A paragraph is not inserted.
export function onEquationKeyDown(editor: SlateEditor, event: EquationKeyEvent): void {
  if (
    event.defaultPrevented ||
    event.key !== "Enter" ||
    event.shiftKey ||
    event.metaKey ||
    event.ctrlKey ||
    event.altKey
  ) {
    return;
  }

  const block = editor.api.block();
  if (!block || !ElementApi.isElement(block[0]) || block[0].type !== KEYS.equation) {
    return;
  }

  const id = block[0].id;
  if (typeof id !== "string" || id.length === 0) {
    return;
  }

  event.preventDefault();
  openEquationEditor(editor, id);
}

function equationNode(id: string): TElement {
  return {
    type: KEYS.equation,
    id,
    texExpression: "",
    children: [{ text: "" }],
  };
}

export function insertEquationBlock(editor: SlateEditor): void {
  const id = nanoid();
  const current = editor.api.block({ highest: true });
  if (!current) {
    editor.tf.insertNodes(equationNode(id), { at: [0], select: true });
  } else {
    const at = PathApi.next(current[1]);
    if (!at) {
      return;
    }
    editor.tf.insertNodes(equationNode(id), { at, select: true });
  }

  openEquationEditor(editor, id);
}

// Insert an equation as the next sibling of `path`, inside its container. The
// block menu only converts; the Add picker needs a path-targeted insert.
export function insertEquationBelow(editor: SlateEditor, path: readonly number[]): string | null {
  const at = PathApi.next([...path]);
  if (!at) {
    return null;
  }
  const id = nanoid();
  editor.tf.insertNodes(equationNode(id), { at, select: true });
  openEquationEditor(editor, id);
  return id;
}

export function setEquationExpression(
  editor: SlateEditor,
  path: number[],
  expression: string,
): boolean {
  const node = editor.api.node(path);
  if (!node || !ElementApi.isElement(node[0]) || node[0].type !== KEYS.equation) {
    return false;
  }

  const current = typeof node[0].texExpression === "string" ? node[0].texExpression : "";
  if (current === expression) {
    return false;
  }

  editor.tf.setNodes({ texExpression: expression }, { at: path });
  return true;
}

export function removeEquation(editor: SlateEditor, path: number[]): void {
  closeEquationEditor(editor);
  editor.tf.removeNodes({ at: path, voids: true });
  if (editor.children.length === 0) {
    editor.tf.insertNodes({ type: KEYS.p, children: [{ text: "" }] }, { at: [0] });
  }
}

export const insertEquation: EditorCommand = {
  id: "block.insert.equation",
  label: "Equation",
  group: "insert",
  run: (editor) => {
    insertEquationBlock(editor);
  },
};

function selectedEquation(editor: SlateEditor): [TElement, number[]] | undefined {
  for (const entry of editor.api.nodes({
    match: (node) => ElementApi.isElement(node) && node.type === KEYS.equation,
    voids: true,
    mode: "lowest",
  })) {
    if (ElementApi.isElement(entry[0])) {
      return [entry[0], entry[1]];
    }
  }
  return undefined;
}

export const removeEquationCommand: EditorCommand = {
  id: "block.equation.remove",
  label: "Delete",
  group: "action",
  isEnabled: (editor) => selectedEquation(editor) !== undefined,
  run: (editor) => {
    const entry = selectedEquation(editor);
    if (!entry) {
      return;
    }
    removeEquation(editor, entry[1]);
  },
};
