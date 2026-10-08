import { ElementApi, KEYS, PathApi, nanoid, type SlateEditor, type TElement } from "platejs";

import type { EditorCommand } from "./editor-commands";
import { embedElement, parseEmbedUrl, type ParsedEmbed } from "./editor-embed-url";
import { setPasteRepairs } from "./editor-paste-repairs";
import {
  pasteUrlActions as pasteUrlActionList,
  replacePastedUrlWith,
  replaceVoidWithParagraph,
} from "./editor-paste-url";

export const EMBED_INVALID_URL = "That link is not a YouTube or Vimeo video.";
export const EMBED_PASTE_DROPPED =
  "An embed was removed because it is not a YouTube or Vimeo video.";

export {
  applyPasteUrlAction,
  clearPasteUrlOffer,
  pasteUrlActions,
  pasteUrlPlugin,
  type PasteUrlAction,
  type PasteUrlOffer,
} from "./editor-paste-url";

pasteUrlActionList.push({
  id: "embed",
  label: "Embed video",
  match: (url) => parseEmbedUrl(url) !== undefined,
  run: (editor, offer) => {
    const parsed = parseEmbedUrl(offer.url);
    if (parsed === undefined) {
      return;
    }

    replacePastedUrlWith(editor, offer, embedElement(parsed, nanoid()));
  },
});

export const embedHtmlDeserializer = {
  isElement: true,
  rules: [{ validNodeName: "IFRAME" }],
  parse({ element }: { element: HTMLElement }): TElement {
    const src = element.getAttribute("src") ?? "";
    const parsed = parseEmbedUrl(src);
    if (parsed === undefined) {
      return { type: KEYS.mediaEmbed, embedDrop: true, children: [{ text: "" }] };
    }

    return embedElement(parsed);
  },
};

export const insertEmbedFromUrl: EditorCommand<string> = {
  id: "block.insert.embed",
  label: "Embed video",
  group: "insert",
  run: (editor, url) => {
    if (editor.dom.readOnly === true) {
      return;
    }

    const parsed = parseEmbedUrl(url);
    if (parsed === undefined) {
      setPasteRepairs(editor, [{ path: [], message: EMBED_INVALID_URL }]);
      return;
    }

    placeEmbed(editor, parsed);
  },
};

export const convertEmbedToText: EditorCommand<string> = {
  id: "block.embed.to-text",
  label: "Convert to text",
  group: "action",
  run: (editor, id) => {
    const entry = writableEmbed(editor, id);
    if (entry === undefined) {
      return;
    }

    const sourceUrl = entry[0].sourceUrl;
    if (typeof sourceUrl !== "string") {
      return;
    }

    replaceVoidWithParagraph(editor, entry[1], sourceUrl);
  },
};

export const removeEmbed: EditorCommand<string> = {
  id: "block.embed.remove",
  label: "Remove",
  group: "action",
  run: (editor, id) => {
    const entry = writableEmbed(editor, id);
    if (entry === undefined) {
      return;
    }

    editor.tf.removeNodes({ at: entry[1] });
    if (editor.children.length === 0) {
      editor.tf.insertNodes(
        { type: KEYS.p, id: nanoid(), children: [{ text: "" }] },
        { at: [0], select: true },
      );
    }
  },
};

function placeEmbed(editor: SlateEditor, parsed: ParsedEmbed): void {
  const entry = editor.api.block({ highest: true });
  if (entry === undefined || !ElementApi.isElement(entry[0])) {
    return;
  }

  const [node, path] = entry;
  const element = embedElement(parsed, nanoid());
  const replaceEmpty =
    node.type === KEYS.p && editor.api.string(node).length === 0 && path.length === 1;
  if (replaceEmpty) {
    editor.tf.removeNodes({ at: path });
    editor.tf.insertNodes(element, { at: path, select: true });
    return;
  }

  const at = PathApi.next(path);
  if (at === undefined) {
    return;
  }

  editor.tf.insertNodes(element, { at, select: true });
}

function writableEmbed(editor: SlateEditor, id: string): [TElement, number[]] | undefined {
  if (editor.dom.readOnly === true) {
    return undefined;
  }

  for (const [node, path] of editor.api.nodes({
    at: [],
    match: (candidate) =>
      ElementApi.isElement(candidate) && candidate.type === KEYS.mediaEmbed && candidate.id === id,
  })) {
    if (ElementApi.isElement(node)) {
      return [node, path];
    }
  }

  return undefined;
}
