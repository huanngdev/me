import {
  ElementApi,
  KEYS,
  PathApi,
  TextApi,
  createSlatePlugin,
  nanoid,
  type SlateEditor,
  type TElement,
} from "platejs";

import type { EditorCommand } from "./editor-commands";
import { selectionInCodeBlock } from "./editor-code";

export type PasteUrlOffer = {
  url: string;
  raw: string;
  path: number[];
  start: number;
  end: number;
};

export type PasteUrlAction = {
  id: string;
  label: string;
  match: (url: string) => boolean;
  run: (editor: SlateEditor, offer: PasteUrlOffer) => void;
};

// Blocks register here. Bookmark unshifts so it stays first. Embed pushes.
// The menu lists every action whose match accepts the pasted URL.
// Each run is a later undo step than the paste.
export const pasteUrlActions: PasteUrlAction[] = [];

function isEditorOnChange(value: unknown): value is (options?: { operation?: unknown }) => void {
  return typeof value === "function";
}

function emptyOffer(): PasteUrlOffer | undefined {
  return undefined;
}

export const pasteUrlPlugin = createSlatePlugin({
  key: "pasteUrl",
  options: {
    offer: emptyOffer(),
  },
}).overrideEditor(({ editor, tf: { insertBreak, insertData, insertFragment, insertText } }) => {
  const { onChange } = editor;
  if (isEditorOnChange(onChange)) {
    editor.onChange = (options?: { operation?: unknown }) => {
      onChange(options);
      dismissOfferIfSelectionMoved(editor);
    };
  }

  return {
    transforms: {
      insertData(data: DataTransfer) {
        clearPasteUrlOffer(editor);
        const prepared = dataWithoutScripts(data);
        const plain = prepared.getData("text/plain");
        const html = prepared.getData("text/html");
        const offerUrl = pasteOfferUrl(editor, plain, html);
        insertData(prepared);
        if (offerUrl === undefined) {
          return;
        }

        const located = insertedRange(editor, plain);
        if (located === undefined) {
          return;
        }

        editor.setOption(pasteUrlPlugin, "offer", {
          url: offerUrl,
          raw: plain,
          path: located.path,
          start: located.start,
          end: located.end,
        });
      },
      insertText(text, options) {
        clearPasteUrlOffer(editor);
        insertText(text, options);
      },
      insertBreak() {
        clearPasteUrlOffer(editor);
        insertBreak();
      },
      insertFragment(fragment, options) {
        clearPasteUrlOffer(editor);
        insertFragment(fragment, options);
      },
    },
  };
});

function dismissOfferIfSelectionMoved(editor: SlateEditor): void {
  const offer = editor.getOption(pasteUrlPlugin, "offer");
  if (offer === undefined || selectionAtOffer(editor, offer)) {
    return;
  }

  clearPasteUrlOffer(editor);
}

function selectionAtOffer(editor: SlateEditor, offer: PasteUrlOffer): boolean {
  const selection = editor.selection;
  if (selection === null || selection === undefined) {
    return false;
  }

  return (
    selection.anchor.offset === offer.end &&
    selection.focus.offset === offer.end &&
    samePath(selection.anchor.path, offer.path) &&
    samePath(selection.focus.path, offer.path)
  );
}

function samePath(path: number[], expected: number[]): boolean {
  return path.length === expected.length && path.every((value, index) => value === expected[index]);
}

export function clearPasteUrlOffer(editor: SlateEditor): void {
  if (editor.getOption(pasteUrlPlugin, "offer") !== undefined) {
    editor.setOption(pasteUrlPlugin, "offer", undefined);
  }
}

export const applyPasteUrlAction: EditorCommand<string> = {
  id: "block.paste-url.apply",
  label: "Apply pasted link",
  group: "action",
  run: (editor, actionId) => {
    if (editor.dom.readOnly === true) {
      return;
    }

    const offer = editor.getOption(pasteUrlPlugin, "offer");
    const action = pasteUrlActions.find((item) => item.id === actionId);
    if (offer === undefined || action === undefined || !action.match(offer.url)) {
      return;
    }

    clearPasteUrlOffer(editor);
    action.run(editor, offer);
  },
};

export function replacePastedUrlWith(
  editor: SlateEditor,
  offer: PasteUrlOffer,
  element: TElement,
): void {
  const textEntry = editor.api.node(offer.path);
  if (textEntry === undefined || !TextApi.isText(textEntry[0])) {
    return;
  }

  const blockEntry = editor.api.block({ at: offer.path });
  if (blockEntry === undefined || !ElementApi.isElement(blockEntry[0])) {
    return;
  }

  const [block, blockPath] = blockEntry;
  const onlyUrl = block.type === KEYS.p && editor.api.string(block).trim() === offer.url;
  if (onlyUrl) {
    editor.tf.removeNodes({ at: blockPath });
    editor.tf.insertNodes(element, { at: blockPath, select: true });
    return;
  }

  editor.tf.delete({
    at: {
      anchor: { path: offer.path, offset: offer.start },
      focus: { path: offer.path, offset: offer.end },
    },
  });
  const after = PathApi.next(blockPath);
  if (after === undefined) {
    return;
  }

  editor.tf.insertNodes(element, { at: after, select: true });
}

export function replaceVoidWithParagraph(editor: SlateEditor, path: number[], text: string): void {
  editor.tf.removeNodes({ at: path });
  editor.tf.insertNodes(
    { type: KEYS.p, id: nanoid(), children: [{ text }] },
    { at: path, select: true },
  );
}

function pasteOfferUrl(editor: SlateEditor, plain: string, html: string): string | undefined {
  if (editor.dom.readOnly === true || html.trim().length > 0) {
    return undefined;
  }

  if (selectionInCodeBlock(editor) || selectionInTableCell(editor)) {
    return undefined;
  }

  const url = bareHttpUrl(plain);
  if (url === undefined) {
    return undefined;
  }

  return pasteUrlActions.some((action) => action.match(url)) ? url : undefined;
}

function bareHttpUrl(text: string): string | undefined {
  const trimmed = text.trim();
  if (trimmed.length === 0 || /\s/.test(trimmed)) {
    return undefined;
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return undefined;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return undefined;
  }

  return trimmed;
}

function selectionInTableCell(editor: SlateEditor): boolean {
  return (
    editor.api.above({
      match: (node) =>
        ElementApi.isElement(node) && (node.type === KEYS.td || node.type === KEYS.th),
    }) !== undefined
  );
}

function insertedRange(
  editor: SlateEditor,
  raw: string,
): { path: number[]; start: number; end: number } | undefined {
  const selection = editor.selection;
  if (selection === null || selection === undefined) {
    return undefined;
  }

  const anchor = selection.anchor;
  const focus = selection.focus;
  if (anchor.offset !== focus.offset || anchor.path.length !== focus.path.length) {
    return undefined;
  }

  for (let index = 0; index < anchor.path.length; index += 1) {
    if (anchor.path[index] !== focus.path[index]) {
      return undefined;
    }
  }

  const entry = editor.api.node(focus.path);
  if (entry === undefined || !TextApi.isText(entry[0])) {
    return undefined;
  }

  const end = focus.offset;
  const start = end - raw.length;
  if (start < 0 || entry[0].text.slice(start, end) !== raw) {
    return undefined;
  }

  return { path: [...focus.path], start, end };
}

function dataWithoutScripts(data: DataTransfer): DataTransfer {
  const html = data.getData("text/html");
  if (html.length === 0 || !/<\s*script\b/i.test(html)) {
    return data;
  }

  const next = new DataTransfer();
  const plain = data.getData("text/plain");
  if (plain.length > 0) {
    next.setData("text/plain", plain);
  }

  const cleaned = htmlWithoutScripts(html);
  if (cleaned.length > 0) {
    next.setData("text/html", cleaned);
  }

  const files = data.files;
  for (let index = 0; index < files.length; index += 1) {
    const file = files.item(index);
    if (file) {
      next.items.add(file);
    }
  }

  return next;
}

function htmlWithoutScripts(html: string): string {
  const document = new DOMParser().parseFromString(html, "text/html");
  for (const node of Array.from(document.querySelectorAll("script"))) {
    node.remove();
  }

  return document.body.innerHTML;
}
