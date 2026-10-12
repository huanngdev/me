import {
  AtSign,
  Bookmark,
  FileText,
  Image as ImageIcon,
  Link,
  Music,
  Paperclip,
  Superscript,
  Video,
  type LucideIcon,
} from "lucide-react";
import {
  ElementApi,
  KEYS,
  NodeApi,
  PathApi,
  TextApi,
  type SlateEditor,
  type TElement,
} from "platejs";

import { AUDIO_KEY } from "./editor-audio";
import { BOOKMARK_KEY } from "./editor-bookmark-url";
import { FILE_KEY } from "./editor-file";
import { IMAGE_KEY } from "./editor-image";
import { VIDEO_KEY } from "./editor-video";
import { blockPlacementRefusal } from "./editor-block-menu";
import { blockPickerItemsAt, type BlockPickerItem } from "./editor-block-picker";
import { insertInlineLink } from "../plugins/editor-link";
import { inlineTriggerBlocked, insertMention } from "../plugins/editor-mention";
import { pageLinkProvider } from "../plugins/editor-page-link";
import { footnoteInsertAllowed } from "./editor-footnote";

export const SLASH_QUERY_LIMIT = 40;
export const SLASH_EMPTY_LABEL = "No results";
export const SLASH_MENU_LABEL = "Insert block";

export type SlashGroup = BlockPickerItem["group"] | "Inline";

export type SlashItem = {
  id: string;
  label: string;
  description: string;
  keywords: readonly string[];
  icon: LucideIcon;
  group: SlashGroup;
  block?: BlockPickerItem;
  inline?: "mention" | "link" | "footnote";
  bookmark?: boolean;
  image?: boolean;
  file?: boolean;
  video?: boolean;
  audio?: boolean;
  pageLink?: boolean;
};

export type SlashAnchor = {
  blockId: string;
  offset: number;
};

export type SlashSession = {
  anchor: SlashAnchor;
  blockPath: number[];
  query: string;
  caretOffset: number;
  replaceInPlace: boolean;
};

type SlashRank = 0 | 1 | 2 | 3 | 4 | 5;

const INLINE_ITEMS: readonly Omit<SlashItem, "block">[] = [
  {
    id: "mention",
    label: "Mention",
    description: "Mention a person",
    keywords: ["at", "person"],
    icon: AtSign,
    group: "Inline",
    inline: "mention",
  },
  {
    id: "link",
    label: "Link",
    description: "Insert a link",
    keywords: ["url"],
    icon: Link,
    group: "Inline",
    inline: "link",
  },
  {
    id: "footnote",
    label: "Footnote",
    description: "Add a note at the end",
    keywords: ["note", "reference", "cite"],
    icon: Superscript,
    group: "Inline",
    inline: "footnote",
  },
];

export function slashTriggerAllowed(editor: SlateEditor, composing: boolean): boolean {
  if (composing || editor.dom.readOnly === true) {
    return false;
  }
  if (editor.selection === null || !editor.api.isCollapsed()) {
    return false;
  }
  if (inlineTriggerBlocked(editor)) {
    return false;
  }
  return charBeforeCaretIsBoundary(editor);
}

export function findSlashBlock(editor: SlateEditor, blockId: string): [TElement, number[]] | null {
  if (blockId.length === 0) {
    return null;
  }
  for (const [node, path] of editor.api.nodes({
    at: [],
    match: (candidate) => ElementApi.isElement(candidate) && candidate.id === blockId,
  })) {
    if (ElementApi.isElement(node)) {
      return [node, path];
    }
  }
  return null;
}

export function blockTextOffset(
  editor: SlateEditor,
  blockPath: readonly number[],
  point: { path: number[]; offset: number },
): number | null {
  if (!pointInBlock(blockPath, point.path)) {
    return null;
  }
  let seen = 0;
  for (const [node, path] of editor.api.nodes({
    at: [...blockPath],
    match: (candidate) => TextApi.isText(candidate),
  })) {
    if (!TextApi.isText(node)) {
      continue;
    }
    if (PathApi.equals(path, point.path)) {
      return seen + point.offset;
    }
    seen += node.text.length;
  }
  return null;
}

export function pointAtBlockOffset(
  editor: SlateEditor,
  blockPath: readonly number[],
  target: number,
): { path: number[]; offset: number } | null {
  if (target < 0) {
    return null;
  }
  let seen = 0;
  let last: { path: number[]; length: number } | null = null;
  for (const [node, path] of editor.api.nodes({
    at: [...blockPath],
    match: (candidate) => TextApi.isText(candidate),
  })) {
    if (!TextApi.isText(node)) {
      continue;
    }
    last = { path, length: node.text.length };
    if (target <= seen + node.text.length) {
      return { path, offset: target - seen };
    }
    seen += node.text.length;
  }
  if (last !== null && target === seen) {
    return { path: last.path, offset: last.length };
  }
  return null;
}

export function readSlashSession(editor: SlateEditor, anchor: SlashAnchor): SlashSession | null {
  if (editor.dom.readOnly === true || editor.selection === null || !editor.api.isCollapsed()) {
    return null;
  }
  const block = findSlashBlock(editor, anchor.blockId);
  if (block === null) {
    return null;
  }
  const text = NodeApi.string(block[0]);
  if (text[anchor.offset] !== "/") {
    return null;
  }
  const caretOffset = blockTextOffset(editor, block[1], editor.selection.anchor);
  if (caretOffset === null || caretOffset <= anchor.offset) {
    return null;
  }
  const query = text.slice(anchor.offset + 1, caretOffset);
  return {
    anchor,
    blockPath: block[1],
    query,
    caretOffset,
    replaceInPlace: replacesInPlace(block[0], text, anchor.offset, caretOffset),
  };
}

export function slashQueryTooLong(query: string): boolean {
  return query.length > SLASH_QUERY_LIMIT;
}

export function slashMatchRank(
  label: string,
  keywords: readonly string[],
  query: string,
): SlashRank | null {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) {
    return null;
  }
  const haystack = label.toLowerCase();
  if (haystack === needle || keywords.some((keyword) => keyword.toLowerCase() === needle)) {
    return 0;
  }
  if (haystack.startsWith(needle)) {
    return 1;
  }
  const words = haystack.split(/\s+/);
  if (words.slice(1).some((word) => word.startsWith(needle))) {
    return 2;
  }
  if (keywords.some((keyword) => keyword.toLowerCase().startsWith(needle))) {
    return 3;
  }
  if (haystack.includes(needle)) {
    return 4;
  }
  if (isSubsequence(needle, haystack)) {
    return 5;
  }
  return null;
}

export function slashAvailableItems(editor: SlateEditor, session: SlashSession): SlashItem[] {
  const index = session.blockPath[session.blockPath.length - 1];
  if (index === undefined) {
    return [];
  }
  const toIndex = session.replaceInPlace ? index : index + 1;
  const blocks = blockPickerItemsAt(editor, session.blockPath, toIndex)
    .filter((item) => !item.disabled)
    .map(slashBlockItem);
  const inline = INLINE_ITEMS.filter((item) => inlineItemEnabled(editor, item.inline));
  const bookmark = bookmarkSlashItem(editor, session);
  const image = imageSlashItem(editor, session);
  const file = fileSlashItem(editor, session);
  const video = videoSlashItem(editor, session);
  const audio = audioSlashItem(editor, session);
  const pageLink = pageLinkSlashItem(editor, bookmark);
  const advanced = [bookmark, pageLink, image, file, video, audio].filter(
    (item): item is SlashItem => item !== null,
  );
  return insertAdvancedSlashItems(blocks, advanced, inline);
}

export function slashItemsForSession(editor: SlateEditor, session: SlashSession): SlashItem[] {
  const items = slashAvailableItems(editor, session);
  if (session.query.length === 0) {
    return items;
  }
  return items
    .map((item, order) => ({
      item,
      order,
      rank: slashMatchRank(item.label, item.keywords, session.query),
    }))
    .filter(
      (entry): entry is { item: SlashItem; order: number; rank: SlashRank } => entry.rank !== null,
    )
    .sort((left, right) => left.rank - right.rank || left.order - right.order)
    .map((entry) => entry.item);
}

export function slashShowsGroups(query: string): boolean {
  return query.length === 0;
}

function insertAdvancedSlashItems(
  blocks: SlashItem[],
  advanced: SlashItem[],
  inline: SlashItem[],
): SlashItem[] {
  if (advanced.length === 0) {
    return [...blocks, ...inline];
  }

  const columnsAt = blocks.findIndex((item) => item.id === "columns");
  const at = columnsAt === -1 ? blocks.length : columnsAt + 1;
  return [...blocks.slice(0, at), ...advanced, ...blocks.slice(at), ...inline];
}

// Offered only with a page provider, and only where Bookmark is offered.
function pageLinkSlashItem(editor: SlateEditor, bookmark: SlashItem | null): SlashItem | null {
  if (bookmark === null || pageLinkProvider(editor) === null) {
    return null;
  }

  return {
    id: "page-link",
    label: "Page link",
    description: "Link to a page",
    keywords: ["page", "subpage", "doc"],
    icon: FileText,
    group: "Advanced",
    pageLink: true,
  };
}

// Offered with or without a file adapter. Without one, the popover has only the link form.
function imageSlashItem(editor: SlateEditor, session: SlashSession): SlashItem | null {
  if (editor.dom.readOnly === true || !blockPlaceable(editor, session, IMAGE_KEY)) {
    return null;
  }

  return {
    id: "image",
    label: "Image",
    description: "Upload or embed with a link",
    keywords: ["image", "photo", "picture", "img"],
    icon: ImageIcon,
    group: "Advanced",
    image: true,
  };
}

// Offered right after Image. The file popover takes any file, so no file type is checked here.
function fileSlashItem(editor: SlateEditor, session: SlashSession): SlashItem | null {
  if (editor.dom.readOnly === true || !blockPlaceable(editor, session, FILE_KEY)) {
    return null;
  }

  return {
    id: "file",
    label: "File",
    description: "Upload or embed with a link",
    keywords: ["file", "attachment", "upload", "document", "pdf"],
    icon: Paperclip,
    group: "Advanced",
    file: true,
  };
}

// Offered right after File. The popover takes any file, so no video type is checked here.
function videoSlashItem(editor: SlateEditor, session: SlashSession): SlashItem | null {
  if (editor.dom.readOnly === true || !blockPlaceable(editor, session, VIDEO_KEY)) {
    return null;
  }

  return {
    id: "video",
    label: "Video",
    description: "Upload or embed with a link",
    keywords: ["video", "movie", "mp4", "clip"],
    icon: Video,
    group: "Advanced",
    video: true,
  };
}

// Offered right after Video.
function audioSlashItem(editor: SlateEditor, session: SlashSession): SlashItem | null {
  if (editor.dom.readOnly === true || !blockPlaceable(editor, session, AUDIO_KEY)) {
    return null;
  }

  return {
    id: "audio",
    label: "Audio",
    description: "Upload or embed with a link",
    keywords: ["audio", "sound", "music", "mp3", "voice"],
    icon: Music,
    group: "Advanced",
    audio: true,
  };
}

function bookmarkSlashItem(editor: SlateEditor, session: SlashSession): SlashItem | null {
  if (editor.dom.readOnly === true || !blockPlaceable(editor, session, BOOKMARK_KEY)) {
    return null;
  }

  return {
    id: "bookmark",
    label: "Bookmark",
    description: "Save a link as a card",
    keywords: ["web", "url", "embed"],
    icon: Bookmark,
    group: "Advanced",
    bookmark: true,
  };
}

function blockPlaceable(editor: SlateEditor, session: SlashSession, type: string): boolean {
  const index = session.blockPath[session.blockPath.length - 1];
  if (index === undefined) {
    return false;
  }

  const parentPath = session.blockPath.slice(0, -1);
  let parentType: string | null = null;
  if (parentPath.length > 0) {
    const parent = editor.api.node([...parentPath]);
    if (!parent || !ElementApi.isElement(parent[0]) || typeof parent[0].type !== "string") {
      return false;
    }
    parentType = parent[0].type;
  }

  const toIndex = session.replaceInPlace ? index : index + 1;
  return blockPlacementRefusal(parentType, toIndex, type, false) === undefined;
}

function slashBlockItem(item: BlockPickerItem): SlashItem {
  return {
    id: item.id,
    label: item.label,
    description: item.description,
    keywords: item.keywords,
    icon: item.icon,
    group: item.group,
    block: item,
  };
}

function inlineItemEnabled(editor: SlateEditor, inline: SlashItem["inline"]): boolean {
  if (inline === "mention") {
    return insertMention.isEnabled?.(editor) === true;
  }
  if (inline === "link") {
    return insertInlineLink.isEnabled?.(editor) === true && editor.api.isCollapsed();
  }
  if (inline === "footnote") {
    return footnoteInsertAllowed(editor) && editor.api.isCollapsed();
  }
  return false;
}

function replacesInPlace(
  node: TElement,
  text: string,
  slashOffset: number,
  caretOffset: number,
): boolean {
  if (node.type !== KEYS.p || !node.children.every((child) => TextApi.isText(child))) {
    return false;
  }
  return slashOffset === 0 && caretOffset === text.length;
}

function charBeforeCaretIsBoundary(editor: SlateEditor): boolean {
  const selection = editor.selection;
  if (selection === null) {
    return false;
  }
  const block = editor.api.block();
  if (!block) {
    return false;
  }
  const start = editor.api.start(block[1]);
  if (
    start &&
    PathApi.equals(selection.anchor.path, start.path) &&
    selection.anchor.offset === start.offset
  ) {
    return true;
  }
  const before = editor.api.before(selection.anchor, { unit: "character" });
  if (!before || !pointInBlock(block[1], before.path)) {
    return true;
  }
  const between = editor.api.string({ anchor: before, focus: selection.anchor });
  return between.length === 0 || /^\s+$/.test(between);
}

function pointInBlock(blockPath: readonly number[], path: readonly number[]): boolean {
  return blockPath.every((value, index) => path[index] === value);
}

function isSubsequence(needle: string, haystack: string): boolean {
  let index = 0;
  for (const character of needle) {
    const found = haystack.indexOf(character, index);
    if (found < 0) {
      return false;
    }
    index = found + 1;
  }
  return true;
}
