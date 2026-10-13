import {
  ElementApi,
  KEYS,
  NodeApi,
  PathApi,
  nanoid,
  type Descendant,
  type SlateEditor,
  type TElement,
} from "platejs";

import { BOOKMARK_KEY } from "./editor-bookmark-url";
import { AUDIO_KEY } from "./editor-audio";
import { EMBED_KEY } from "./editor-embed";
import { FILE_KEY } from "./editor-file";
import { IMAGE_KEY } from "./editor-image";
import { VIDEO_KEY } from "./editor-video";
import { PAGE_LINK_KEY } from "./editor-page-link";
import { isInsideTable } from "./editor-block-tone";
import { BLOCK_TONE_TYPES } from "./editor-block-tone-style";
import { blockIndentOf, isListParagraph } from "./editor-block-indent-style";
import { SYNCED_REF_KEY } from "./editor-synced-block";
import {
  FOOTNOTE_DEF_KEY,
  FOOTNOTE_REF_KEY,
  allowedChildTypes,
  allowsFirstChild,
  containerContentType,
  isPaletteToken,
  maxNesting,
} from "../document/editor-document-schema";

/** Grip tooltip. Drag reuses this exact string. */
export const BLOCK_MENU_GRIP_LABEL = "Drag to move · Click to open menu";

export const BLOCK_MENU_KINDS = [
  "paragraph",
  "h1",
  "h2",
  "h3",
  "bulleted",
  "numbered",
  "todo",
  "toggle",
  "toggle-h1",
  "toggle-h2",
  "toggle-h3",
  "quote",
  "callout",
  "code",
] as const;

export type BlockMenuKind = (typeof BLOCK_MENU_KINDS)[number];

export const BLOCK_MENU_TURNS: readonly {
  kind: BlockMenuKind;
  label: string;
  commandId: string;
}[] = [
  { kind: "paragraph", label: "Text", commandId: "block.turn-into.paragraph" },
  { kind: "h1", label: "Heading 1", commandId: "block.turn-into.h1" },
  { kind: "h2", label: "Heading 2", commandId: "block.turn-into.h2" },
  { kind: "h3", label: "Heading 3", commandId: "block.turn-into.h3" },
  { kind: "bulleted", label: "Bulleted list", commandId: "block.turn-into.bulleted-list" },
  { kind: "numbered", label: "Numbered list", commandId: "block.turn-into.numbered-list" },
  { kind: "todo", label: "To-do list", commandId: "block.turn-into.todo-list" },
  { kind: "toggle", label: "Toggle", commandId: "block.turn-into.toggle" },
  { kind: "toggle-h1", label: "Toggle heading 1", commandId: "block.turn-into.toggle-h1" },
  { kind: "toggle-h2", label: "Toggle heading 2", commandId: "block.turn-into.toggle-h2" },
  { kind: "toggle-h3", label: "Toggle heading 3", commandId: "block.turn-into.toggle-h3" },
  { kind: "quote", label: "Quote", commandId: "block.turn-into.blockquote" },
  { kind: "callout", label: "Callout", commandId: "block.turn-into.callout" },
  { kind: "code", label: "Code", commandId: "block.turn-into.code-block" },
];

type TurnEffect =
  "same" | "retype-leaf" | "wrap" | "retype-container" | "lift" | "to-code" | "from-code";

type TurnDecision = {
  kind: BlockMenuKind;
  label: string;
  commandId: string;
  allowed: boolean;
  reason?: string;
  effect: TurnEffect;
};

type MenuChildView = {
  type: string;
  listStyleType?: string;
  rich: boolean;
};

export type MenuBlockView = {
  type: string;
  listStyleType?: string;
  rich: boolean;
  children: readonly MenuChildView[];
  parentType: string | null;
  index: number;
  toggleAncestors: number;
};

export type NativeMenuProbe = {
  selectionCollapsed: boolean;
  pointInsideSelection: boolean;
  insideLink: boolean;
  insideTableCell: boolean;
  insideCodeText: boolean;
  insideControl: boolean;
  hasBlockTarget: boolean;
};

const STRUCTURAL = new Set<string>([
  KEYS.table,
  KEYS.columnGroup,
  KEYS.column,
  KEYS.tr,
  KEYS.td,
  KEYS.th,
  KEYS.hr,
  BOOKMARK_KEY,
  IMAGE_KEY,
  FILE_KEY,
  VIDEO_KEY,
  AUDIO_KEY,
  EMBED_KEY,
  PAGE_LINK_KEY,
  KEYS.equation,
  KEYS.toc,
  SYNCED_REF_KEY,
  KEYS.codeLine,
  // A definition is neither a Turn into source nor a target.
  FOOTNOTE_DEF_KEY,
]);

const TOGGLE_KINDS = new Set<BlockMenuKind>(["toggle", "toggle-h1", "toggle-h2", "toggle-h3"]);

const TONE_KEYS = ["textTone", "backgroundTone"] as const;

const LIST_ATTRS = [
  "listStyleType",
  "indent",
  "checked",
  "listStart",
  "listRestart",
  "listRestartPolite",
] as const;

const TEXT_TYPES = new Set<string>([KEYS.p, KEYS.h1, KEYS.h2, KEYS.h3]);

// Keep the browser menu for spellcheck and copy. A right-click opens this menu
// only when every flag below is false and the point resolves to a block.
export function keepNativeContextMenu(probe: NativeMenuProbe): boolean {
  if (probe.insideControl) {
    return true;
  }
  if (!probe.selectionCollapsed && probe.pointInsideSelection) {
    return true;
  }
  if (probe.insideLink || probe.insideTableCell || probe.insideCodeText) {
    return true;
  }
  return !probe.hasBlockTarget;
}

export function isBlockMenuShortcut(event: {
  key: string;
  code?: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}): boolean {
  if (event.altKey || event.shiftKey) {
    return false;
  }
  // Exactly one of Meta or Ctrl. Help is Shift+Mod+/, so Shift stays native.
  if (event.metaKey === event.ctrlKey) {
    return false;
  }
  return event.key === "/" || event.code === "Slash";
}

export function blockMenuDecisions(view: MenuBlockView): readonly TurnDecision[] | null {
  if (STRUCTURAL.has(view.type) || currentKind(view) === null) {
    return null;
  }

  return BLOCK_MENU_TURNS.map((item) => decide(view, item));
}

export function currentBlockMenuKind(view: MenuBlockView): BlockMenuKind | null {
  return currentKind(view);
}

type ColumnGroupMenu = {
  count: 2 | 3;
};

// The column hover bar is gone. These two actions live on the block menu when
// the target is a column group, and nowhere else.
export function columnGroupMenu(view: MenuBlockView): ColumnGroupMenu | null {
  if (view.type !== KEYS.columnGroup) {
    return null;
  }

  return { count: view.children.length === 3 ? 3 : 2 };
}

export function menuBlockView(editor: SlateEditor, path: number[]): MenuBlockView | null {
  const entry = editor.api.node(path);
  const node = entry?.[0];
  if (!entry || !ElementApi.isElement(node) || typeof node.type !== "string") {
    return null;
  }

  return viewAt(editor, node, entry[1]);
}

export function applyBlockTurn(editor: SlateEditor, path: number[], kind: BlockMenuKind): boolean {
  const at = [...path];
  const entry = editor.api.node(at);
  const node = entry?.[0];
  if (!entry || !ElementApi.isElement(node)) {
    return false;
  }

  const view = viewAt(editor, node, entry[1]);
  const decision = blockMenuDecisions(view)?.find((item) => item.kind === kind);
  if (!decision || !decision.allowed) {
    return false;
  }
  // Turning into the same kind changes nothing, and that is still an accepted turn.
  if (decision.effect === "same") {
    return true;
  }

  const seen = collectIds(editor);
  const replacement = replacementNodes(node, decision.effect, kind, seen);
  // Table cells own their colour, so nothing inside a table keeps a tone.
  if (isInsideTable(editor, at)) {
    for (const next of replacement) {
      unsetTones(next);
    }
  }
  editor.tf.withoutNormalizing(() => {
    replaceAt(editor, at, replacement);
  });
  selectStart(editor, at);
  return true;
}

export function duplicateBlockAt(editor: SlateEditor, path: number[]): boolean {
  const at = [...path];
  const entry = editor.api.node(at);
  const node = entry?.[0];
  if (!entry || !ElementApi.isElement(node)) {
    return false;
  }

  const dest = PathApi.next(at);
  if (!dest) {
    return false;
  }

  const copy = structuredClone(node);
  assignNewIds(copy, collectIds(editor));
  editor.tf.insertNodes(copy, { at: dest });
  selectStart(editor, dest);
  return true;
}

export function deleteBlockAt(editor: SlateEditor, path: number[]): boolean {
  const at = [...path];
  const entry = editor.api.node(at);
  if (!entry || !ElementApi.isElement(entry[0])) {
    return false;
  }

  const parentPath = at.slice(0, -1);
  editor.tf.removeNodes({ at });

  if (parentPath.length === 0 && editor.children.length === 0) {
    const id = createId(collectIds(editor));
    editor.tf.insertNodes(textBlock(id, "paragraph", [{ text: "" }]), { at: [0] });
    selectStart(editor, [0]);
    return true;
  }

  if (parentPath.length > 0) {
    const parent = editor.api.node(parentPath);
    const parentNode = parent?.[0];
    if (
      parent &&
      ElementApi.isElement(parentNode) &&
      typeof parentNode.type === "string" &&
      parentNode.children.length === 0
    ) {
      const content = containerContentType(parentNode.type) ?? KEYS.p;
      const id = createId(collectIds(editor));
      const child =
        content === KEYS.p
          ? textBlock(id, "paragraph", [{ text: "" }])
          : { type: content, id, children: [{ text: "" }] };
      const childPath = parentPath.concat(0);
      editor.tf.insertNodes(child, { at: childPath });
      selectStart(editor, childPath);
      return true;
    }
  }

  if (editor.api.node(at)) {
    selectStart(editor, at);
    return true;
  }

  const index = at[at.length - 1] ?? 0;
  if (index > 0) {
    const previous = at.slice(0, -1).concat(index - 1);
    if (editor.api.node(previous)) {
      selectStart(editor, previous);
    }
  }

  return true;
}

function decide(view: MenuBlockView, item: (typeof BLOCK_MENU_TURNS)[number]): TurnDecision {
  const effect = effectFor(view, item.kind);
  // Staying the same kind is a no-op, except a code block: only Text is offered.
  if (effect === "same" && view.type !== KEYS.codeBlock) {
    return { ...item, allowed: true, effect };
  }

  const reason = refusal(view, item.kind);
  if (reason !== undefined) {
    return { ...item, allowed: false, reason, effect };
  }

  return { ...item, allowed: true, effect };
}

function refusal(view: MenuBlockView, kind: BlockMenuKind): string | undefined {
  if (view.type === KEYS.codeBlock && kind !== "paragraph") {
    return "Code turns into text.";
  }

  if (kind === "code" && !codeKeepsContent(view)) {
    return "Code keeps plain text only.";
  }

  const placed = parentRefusal(view.parentType, view.index, kind);
  if (placed !== undefined) {
    return placed;
  }

  const nested = nestingRefusal(view, kind);
  if (nested !== undefined) {
    return nested;
  }

  if (isContainerType(view.type) && isContainerKind(kind)) {
    return containerChildRefusal(view, kind);
  }

  if (isContainerType(view.type) && isLeafKind(kind)) {
    return liftedChildRefusal(view, kind);
  }

  return undefined;
}

function effectFor(view: MenuBlockView, kind: BlockMenuKind): TurnEffect {
  const current = currentKind(view);
  if (current === kind) {
    return "same";
  }
  if (view.type === KEYS.codeBlock) {
    return "from-code";
  }
  if (kind === "code") {
    return "to-code";
  }
  if (isContainerType(view.type) && isContainerKind(kind)) {
    return "retype-container";
  }
  if (isContainerType(view.type)) {
    return "lift";
  }
  if (isContainerKind(kind)) {
    return "wrap";
  }
  return "retype-leaf";
}

function codeKeepsContent(view: MenuBlockView): boolean {
  if (view.rich || view.listStyleType !== undefined) {
    return false;
  }
  if (!isContainerType(view.type)) {
    return TEXT_TYPES.has(view.type);
  }

  return view.children.every(
    (child) => TEXT_TYPES.has(child.type) && !child.rich && child.listStyleType === undefined,
  );
}

function parentRefusal(
  parentType: string | null,
  index: number,
  kind: BlockMenuKind,
): string | undefined {
  return typeRefusal(parentType, index, slateType(kind), listStyleOf(kind) !== undefined, kind);
}

function typeRefusal(
  parentType: string | null,
  index: number,
  type: string,
  asList: boolean,
  kind?: BlockMenuKind,
): string | undefined {
  if (parentType === null) {
    return undefined;
  }

  if (parentType === KEYS.toggle && index === 0) {
    if (asList) {
      return "A toggle label cannot be a list.";
    }
    if (!allowsFirstChild(parentType, type)) {
      return "A toggle label must be text or a heading.";
    }
    return undefined;
  }

  const allowed = allowedChildTypes(parentType);
  if (allowed !== undefined && allowed.some((child) => child === type)) {
    return undefined;
  }

  return parentBlockReason(
    parentType,
    kind ?? kindForChild({ type, listStyleType: asList ? "disc" : undefined, rich: false }),
  );
}

// Same parent rules as Turn into and paste. Callers that must refuse a slot the
// matrix would allow (a table cell, a toggle label) do that before calling this.
export function blockPlacementRefusal(
  parentType: string | null,
  index: number,
  type: string,
  asList: boolean,
): string | undefined {
  return typeRefusal(parentType, index, type, asList);
}

function nestingRefusal(view: MenuBlockView, kind: BlockMenuKind): string | undefined {
  if (!TOGGLE_KINDS.has(kind) || view.type === KEYS.toggle) {
    return undefined;
  }

  const limit = maxNesting(KEYS.toggle) ?? 3;
  if (view.toggleAncestors + 1 > limit) {
    return "Toggles can only nest three levels deep.";
  }

  return undefined;
}

function containerChildRefusal(view: MenuBlockView, kind: BlockMenuKind): string | undefined {
  if (kind === "quote" || kind === "callout") {
    for (const child of view.children) {
      if (TEXT_TYPES.has(child.type)) {
        continue;
      }
      const name = child.type === KEYS.toggle ? "a toggle" : article(child.type);
      return kind === "quote" ? `A quote cannot hold ${name}.` : `A callout cannot hold ${name}.`;
    }
  }

  return undefined;
}

// Children that cannot become the target leaf stay in the parent. Refuse when
// that parent would reject them, so a lift never hands the normalizer a block to drop.
function liftedChildRefusal(view: MenuBlockView, kind: BlockMenuKind): string | undefined {
  const first = view.children[0];
  const lifted =
    first !== undefined && canRepresent(first, kind) ? view.children.slice(1) : view.children;
  for (const child of lifted) {
    const reason = typeRefusal(
      view.parentType,
      view.index + 1,
      child.type,
      child.listStyleType !== undefined,
    );
    if (reason !== undefined) {
      return reason;
    }
  }

  return undefined;
}

function kindForChild(child: MenuChildView): BlockMenuKind {
  if (child.listStyleType === "disc") {
    return "bulleted";
  }
  if (child.listStyleType === "decimal") {
    return "numbered";
  }
  if (child.listStyleType === "todo") {
    return "todo";
  }
  if (child.type === KEYS.h1) {
    return "h1";
  }
  if (child.type === KEYS.h2) {
    return "h2";
  }
  if (child.type === KEYS.h3) {
    return "h3";
  }
  if (child.type === KEYS.blockquote) {
    return "quote";
  }
  if (child.type === KEYS.callout) {
    return "callout";
  }
  if (child.type === KEYS.toggle) {
    return "toggle";
  }
  if (child.type === KEYS.codeBlock) {
    return "code";
  }
  return "paragraph";
}

function parentBlockReason(parentType: string, kind: BlockMenuKind): string {
  const child = kindNoun(kind);
  if (parentType === KEYS.td || parentType === KEYS.th) {
    return "A table cell can only hold text.";
  }
  if (parentType === KEYS.blockquote) {
    return `A quote cannot hold ${child}.`;
  }
  if (parentType === KEYS.callout) {
    return `A callout cannot hold ${child}.`;
  }
  if (parentType === KEYS.toggle) {
    return `A toggle cannot hold ${child}.`;
  }
  if (parentType === KEYS.codeBlock) {
    return "A code block can only hold code lines.";
  }
  return `This block cannot hold ${child}.`;
}

function kindNoun(kind: BlockMenuKind): string {
  if (kind === "h1" || kind === "h2" || kind === "h3" || kind.startsWith("toggle-h")) {
    return "a heading";
  }
  if (kind === "bulleted" || kind === "numbered" || kind === "todo") {
    return "a list";
  }
  if (kind === "toggle") {
    return "a toggle";
  }
  if (kind === "quote") {
    return "a quote";
  }
  if (kind === "callout") {
    return "a callout";
  }
  if (kind === "code") {
    return "a code block";
  }
  return "text";
}

function article(type: string): string {
  if (type === KEYS.table) {
    return "a table";
  }
  if (type === KEYS.codeBlock) {
    return "a code block";
  }
  if (type === KEYS.blockquote) {
    return "a quote";
  }
  if (type === KEYS.callout) {
    return "a callout";
  }
  if (type === KEYS.hr) {
    return "a divider";
  }
  if (type === IMAGE_KEY) {
    return "an image";
  }
  if (type === FILE_KEY) {
    return "a file";
  }
  if (type === VIDEO_KEY) {
    return "a video";
  }
  if (type === AUDIO_KEY) {
    return "an audio file";
  }
  if (type === EMBED_KEY) {
    return "an embed";
  }
  return "that block";
}

function currentKind(view: MenuBlockView): BlockMenuKind | null {
  if (STRUCTURAL.has(view.type)) {
    return null;
  }
  if (view.type === KEYS.h1) {
    return "h1";
  }
  if (view.type === KEYS.h2) {
    return "h2";
  }
  if (view.type === KEYS.h3) {
    return "h3";
  }
  if (view.type === KEYS.blockquote) {
    return "quote";
  }
  if (view.type === KEYS.callout) {
    return "callout";
  }
  if (view.type === KEYS.codeBlock) {
    return "code";
  }
  if (view.type === KEYS.toggle) {
    const label = view.children[0]?.type;
    if (label === KEYS.h1) {
      return "toggle-h1";
    }
    if (label === KEYS.h2) {
      return "toggle-h2";
    }
    if (label === KEYS.h3) {
      return "toggle-h3";
    }
    return "toggle";
  }
  if (view.type === KEYS.p) {
    if (view.listStyleType === "disc") {
      return "bulleted";
    }
    if (view.listStyleType === "decimal") {
      return "numbered";
    }
    if (view.listStyleType === "todo") {
      return "todo";
    }
    return "paragraph";
  }
  return null;
}

function replacementNodes(
  node: TElement,
  effect: TurnEffect,
  kind: BlockMenuKind,
  seen: Set<string>,
): TElement[] {
  if (effect === "from-code") {
    return codeToParagraphs(node, seen);
  }
  if (effect === "to-code") {
    return [toCode(node, seen)];
  }
  if (effect === "retype-leaf") {
    return [retypeLeaf(node, kind)];
  }
  if (effect === "wrap") {
    return [wrapLeaf(node, kind, seen)];
  }
  if (effect === "retype-container") {
    return [retypeContainer(node, kind, seen)];
  }
  if (effect === "lift") {
    const lifted = containerToLeaf(node, kind);
    return [lifted.leaf, ...lifted.rest];
  }
  return [structuredClone(node)];
}

// A plain indent moves to the next block. A list item's depth is not a plain indent, so it stops here.
function plainIndentOf(node: TElement): number | undefined {
  if (isListParagraph(node)) {
    return undefined;
  }
  return blockIndentOf(node) || undefined;
}

function retypeLeaf(node: TElement, kind: BlockMenuKind): TElement {
  const align = stringProp(node, "align");
  const lineHeight = stringProp(node, "lineHeight");
  return textBlock(
    nodeId(node),
    kind,
    structuredClone(node.children),
    align,
    lineHeight,
    node,
    plainIndentOf(node),
  );
}

function wrapLeaf(node: TElement, kind: BlockMenuKind, seen: Set<string>): TElement {
  const align = stringProp(node, "align");
  const lineHeight = stringProp(node, "lineHeight");
  const inlines = structuredClone(node.children);
  const label = labelKind(kind, node);
  const inner = textBlock(createId(seen), label, inlines, align, lineHeight, node);
  const outer = containerNode(nodeId(node), kind, [inner]);
  // Only a quote keeps a plain indent on its own element. Callout and toggle drop it.
  const indent = plainIndentOf(node);
  if (kind === "quote" && indent !== undefined) {
    setProp(outer, "indent", indent);
  }
  return outer;
}

function retypeContainer(node: TElement, kind: BlockMenuKind, seen: Set<string>): TElement {
  const next = structuredClone(node);
  next.type = slateType(kind);
  unsetProp(next, "icon");
  unsetProp(next, "variant");
  unsetProp(next, "lineHeight");
  if (!BLOCK_TONE_TYPES.includes(next.type)) {
    unsetTones(next);
  }
  for (const key of LIST_ATTRS) {
    unsetProp(next, key);
  }

  if (TOGGLE_KINDS.has(kind)) {
    normalizeToggleLabel(next, kind, seen);
    return next;
  }

  for (const child of blockElements(next)) {
    if (child.type === KEYS.h1 || child.type === KEYS.h2 || child.type === KEYS.h3) {
      child.type = KEYS.p;
      unsetProp(child, "lineHeight");
    }
  }

  return next;
}

function containerToLeaf(
  node: TElement,
  kind: BlockMenuKind,
): { leaf: TElement; rest: TElement[] } {
  const children = blockElements(node);
  const first = children[0];
  // A quote's indent comes along, else the first plain child's, as align does.
  const quoteIndent = plainIndentOf(node);
  if (first && canRepresent(childView(first), kind)) {
    // A toned quote keeps its tone. Otherwise the first child's tone comes along, as align does.
    const toned = hasTone(node) ? node : first;
    const leaf = textBlock(
      nodeId(node),
      kind,
      structuredClone(first.children),
      stringProp(first, "align"),
      stringProp(first, "lineHeight"),
      toned,
      quoteIndent ?? plainIndentOf(first),
    );
    return { leaf, rest: children.slice(1).map((child) => structuredClone(child)) };
  }

  return {
    leaf: textBlock(
      nodeId(node),
      kind,
      [{ text: "" }],
      undefined,
      undefined,
      undefined,
      quoteIndent,
    ),
    rest: children.map((child) => structuredClone(child)),
  };
}

function toCode(node: TElement, seen: Set<string>): TElement {
  const lines = isContainerType(node.type)
    ? blockElements(node).map((child) => codeLine(keptId(child, seen), NodeApi.string(child)))
    : [codeLine(createId(seen), NodeApi.string(node))];
  const children = lines.length > 0 ? lines : [codeLine(createId(seen), "")];
  return { type: KEYS.codeBlock, id: nodeId(node), children };
}

function codeToParagraphs(node: TElement, seen: Set<string>): TElement[] {
  const lines = blockElements(node);
  if (lines.length === 0) {
    return [textBlock(nodeId(node), "paragraph", [{ text: "" }])];
  }

  return lines.map((line, index) => {
    const id = index === 0 ? nodeId(node) : keptId(line, seen);
    return textBlock(id, "paragraph", [{ text: NodeApi.string(line) }]);
  });
}

function normalizeToggleLabel(node: TElement, kind: BlockMenuKind, seen: Set<string>): void {
  const children = blockElements(node);
  const first = children[0];
  const wanted = labelType(kind);
  if (first && (first.type === KEYS.p || isHeadingType(first.type)) && !hasListStyle(first)) {
    first.type = wanted;
    for (const key of LIST_ATTRS) {
      unsetProp(first, key);
    }
    if (wanted !== KEYS.p) {
      unsetProp(first, "lineHeight");
    }
    return;
  }

  const label = textBlock(createId(seen), labelKindFromType(wanted), [{ text: "" }]);
  node.children = [label, ...node.children];
}

function labelKind(kind: BlockMenuKind, source: TElement): BlockMenuKind {
  if (TOGGLE_KINDS.has(kind)) {
    return labelKindFromType(labelType(kind));
  }
  if (hasListStyle(source)) {
    return kindForChild(childView(source));
  }
  return "paragraph";
}

function labelKindFromType(type: string): BlockMenuKind {
  if (type === KEYS.h1) {
    return "h1";
  }
  if (type === KEYS.h2) {
    return "h2";
  }
  if (type === KEYS.h3) {
    return "h3";
  }
  return "paragraph";
}

function canRepresent(child: MenuChildView, kind: BlockMenuKind): boolean {
  if (!TEXT_TYPES.has(child.type)) {
    return false;
  }
  return child.listStyleType === listStyleOf(kind);
}

function childView(node: TElement): MenuChildView {
  return {
    type: node.type,
    listStyleType: stringProp(node, "listStyleType"),
    rich: isRich(node),
  };
}

// A list kind takes indent as its depth, and 1 when there is none. A plain paragraph or
// heading takes indent only when given one.
function textBlock(
  id: string,
  kind: BlockMenuKind,
  children: Descendant[],
  align?: string,
  lineHeight?: string,
  toneSource?: TElement,
  indent?: number,
): TElement {
  const node: TElement = { type: slateType(kind), id, children };
  if (toneSource !== undefined) {
    copyTones(node, toneSource);
  }
  if (align !== undefined && allowsAlign(kind)) {
    setProp(node, "align", align);
  }
  if (lineHeight !== undefined && allowsLineHeight(kind)) {
    setProp(node, "lineHeight", lineHeight);
  }
  const style = listStyleOf(kind);
  if (style !== undefined) {
    setProp(node, "listStyleType", style);
    setProp(node, "indent", indent ?? 1);
  } else if (indent !== undefined && isPlainIndentKind(kind)) {
    setProp(node, "indent", indent);
  }
  if (kind === "numbered") {
    setProp(node, "listStart", 1);
  }
  if (kind === "todo") {
    setProp(node, "checked", false);
  }
  return node;
}

function containerNode(id: string, kind: BlockMenuKind, children: Descendant[]): TElement {
  return { type: slateType(kind), id, children };
}

function codeLine(id: string, text: string): TElement {
  return { type: KEYS.codeLine, id, children: [{ text }] };
}

// Tones move only onto block types that store them. Callout and toggle drop them.
function copyTones(target: TElement, source: TElement): void {
  if (!BLOCK_TONE_TYPES.includes(target.type)) {
    return;
  }

  for (const key of TONE_KEYS) {
    const value = stringProp(source, key);
    if (isPaletteToken(value)) {
      setProp(target, key, value);
    }
  }
}

function unsetTones(node: TElement): void {
  for (const key of TONE_KEYS) {
    unsetProp(node, key);
  }
}

function hasTone(node: TElement): boolean {
  return TONE_KEYS.some((key) => stringProp(node, key) !== undefined);
}

function isPlainIndentKind(kind: BlockMenuKind): boolean {
  return kind === "paragraph" || kind === "h1" || kind === "h2" || kind === "h3";
}

function allowsAlign(kind: BlockMenuKind): boolean {
  return isLeafKind(kind);
}

function allowsLineHeight(kind: BlockMenuKind): boolean {
  return kind === "paragraph" || kind === "bulleted" || kind === "numbered" || kind === "todo";
}

function slateType(kind: BlockMenuKind): string {
  if (kind === "h1" || kind === "toggle-h1") {
    return kind === "toggle-h1" ? KEYS.toggle : KEYS.h1;
  }
  if (kind === "h2") {
    return KEYS.h2;
  }
  if (kind === "h3") {
    return KEYS.h3;
  }
  if (kind === "quote") {
    return KEYS.blockquote;
  }
  if (kind === "callout") {
    return KEYS.callout;
  }
  if (TOGGLE_KINDS.has(kind)) {
    return KEYS.toggle;
  }
  if (kind === "code") {
    return KEYS.codeBlock;
  }
  return KEYS.p;
}

function labelType(kind: BlockMenuKind): string {
  if (kind === "toggle-h1") {
    return KEYS.h1;
  }
  if (kind === "toggle-h2") {
    return KEYS.h2;
  }
  if (kind === "toggle-h3") {
    return KEYS.h3;
  }
  return KEYS.p;
}

function listStyleOf(kind: BlockMenuKind): "disc" | "decimal" | "todo" | undefined {
  if (kind === "bulleted") {
    return "disc";
  }
  if (kind === "numbered") {
    return "decimal";
  }
  if (kind === "todo") {
    return "todo";
  }
  return undefined;
}

function isLeafKind(kind: BlockMenuKind): boolean {
  return (
    kind === "paragraph" ||
    kind === "h1" ||
    kind === "h2" ||
    kind === "h3" ||
    kind === "bulleted" ||
    kind === "numbered" ||
    kind === "todo"
  );
}

function isContainerKind(kind: BlockMenuKind): boolean {
  return kind === "quote" || kind === "callout" || TOGGLE_KINDS.has(kind);
}

function isContainerType(type: string): boolean {
  return (
    type === KEYS.blockquote ||
    type === KEYS.callout ||
    type === KEYS.toggle ||
    type === KEYS.codeBlock
  );
}

function isHeadingType(type: string): boolean {
  return type === KEYS.h1 || type === KEYS.h2 || type === KEYS.h3;
}

function hasListStyle(node: TElement): boolean {
  return stringProp(node, "listStyleType") !== undefined;
}

function blockElements(node: TElement): TElement[] {
  const blocks: TElement[] = [];
  for (const child of node.children) {
    if (!ElementApi.isElement(child) || typeof child.type !== "string") {
      continue;
    }
    if (
      child.type === KEYS.link ||
      child.type === KEYS.mention ||
      child.type === KEYS.inlineEquation ||
      child.type === KEYS.date ||
      child.type === FOOTNOTE_REF_KEY
    ) {
      continue;
    }
    blocks.push(child);
  }
  return blocks;
}

function viewAt(editor: SlateEditor, node: TElement, path: number[]): MenuBlockView {
  const parentPath = path.slice(0, -1);
  let parentType: string | null = null;
  let toggleAncestors = 0;
  for (let depth = 1; depth < path.length; depth += 1) {
    const ancestor = editor.api.node(path.slice(0, depth));
    const ancestorNode = ancestor?.[0];
    if (!ancestor || !ElementApi.isElement(ancestorNode) || typeof ancestorNode.type !== "string") {
      continue;
    }
    if (ancestorNode.type === KEYS.toggle) {
      toggleAncestors += 1;
    }
    if (depth === path.length - 1) {
      parentType = ancestorNode.type;
    }
  }
  if (parentType === null && parentPath.length > 0) {
    const parent = editor.api.node(parentPath);
    const parentNode = parent?.[0];
    if (parent && ElementApi.isElement(parentNode) && typeof parentNode.type === "string") {
      parentType = parentNode.type;
    }
  }

  return {
    type: node.type,
    listStyleType: stringProp(node, "listStyleType"),
    rich: isRich(node),
    children: blockElements(node).map((child) => childView(child)),
    parentType,
    index: path[path.length - 1] ?? 0,
    toggleAncestors,
  };
}

function isRich(node: Descendant): boolean {
  if (ElementApi.isElement(node)) {
    if (
      node.type === KEYS.link ||
      node.type === KEYS.mention ||
      node.type === KEYS.inlineEquation ||
      node.type === KEYS.date ||
      node.type === FOOTNOTE_REF_KEY
    ) {
      return true;
    }
    return node.children.some((child) => isRich(child));
  }

  if (!("text" in node)) {
    return false;
  }

  for (const key of Object.keys(node)) {
    if (key !== "text") {
      return true;
    }
  }
  return false;
}

function replaceAt(editor: SlateEditor, path: number[], nodes: readonly TElement[]): void {
  editor.tf.removeNodes({ at: path });
  let at = path;
  for (const node of nodes) {
    editor.tf.insertNodes(node, { at });
    const next = PathApi.next(at);
    if (!next) {
      return;
    }
    at = next;
  }
}

function selectStart(editor: SlateEditor, path: number[]): void {
  const start = editor.api.start(path);
  if (start) {
    editor.tf.select(start);
  }
}

export function collectIds(editor: SlateEditor): Set<string> {
  const seen = new Set<string>();
  const visit = (node: Descendant): void => {
    if (!ElementApi.isElement(node)) {
      return;
    }
    const id = nodeId(node);
    if (id.length > 0) {
      seen.add(id);
    }
    for (const child of node.children) {
      visit(child);
    }
  };
  for (const child of editor.children) {
    visit(child);
  }
  return seen;
}

export function cloneWithFreshIds(node: TElement, seen: Set<string>): TElement {
  const copy = structuredClone(node);
  assignNewIds(copy, seen);
  return copy;
}

function assignNewIds(node: TElement, seen: Set<string>): void {
  setProp(node, "id", createId(seen));
  for (const child of node.children) {
    if (ElementApi.isElement(child)) {
      assignNewIds(child, seen);
    }
  }
}

function keptId(node: TElement, seen: Set<string>): string {
  const id = nodeId(node);
  if (id.length > 0 && !seen.has(id)) {
    seen.add(id);
    return id;
  }
  // The code block reuses its own id on the first paragraph, so a line that
  // shared it would collide. Allocate instead of writing the same id twice.
  if (id.length > 0 && seen.has(id)) {
    return createId(seen);
  }
  return createId(seen);
}

function createId(seen: Set<string>): string {
  let id = nanoid(10);
  let suffix = 1;
  while (id.length === 0 || seen.has(id)) {
    id = `${nanoid(10)}-${suffix}`;
    suffix += 1;
  }
  seen.add(id);
  return id;
}

function nodeId(node: TElement): string {
  const id: unknown = Reflect.get(node, "id");
  return typeof id === "string" ? id : "";
}

function stringProp(node: TElement, key: string): string | undefined {
  const value: unknown = Reflect.get(node, key);
  return typeof value === "string" ? value : undefined;
}

function setProp(node: TElement, key: string, value: string | number | boolean): void {
  Reflect.set(node, key, value);
}

function unsetProp(node: TElement, key: string): void {
  Reflect.deleteProperty(node, key);
}
