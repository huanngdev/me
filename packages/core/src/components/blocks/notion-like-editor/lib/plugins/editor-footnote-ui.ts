import { ElementApi, type Point, type SlateEditor } from "platejs";

import type { EditorCommand } from "../commands/editor-commands";
import { FOOTNOTE_DEF_KEY, FOOTNOTE_REF_KEY } from "../document/editor-document-schema";
import {
  footnoteDefinitionIdAt,
  footnoteDefinitionEntry,
  footnoteInsertAllowed,
  footnoteReferenceEntries,
  insertFootnote,
  selectAfterFootnoteReference,
  selectFootnoteDefinition,
  selectFootnoteReference,
} from "../features/editor-footnote";
import { blockSelectionActive } from "./editor-block-selection";

// Scrolls the node's DOM into view. Used after a jump, so the target is visible.
function scrollPathIntoView(editor: SlateEditor, path: readonly number[]): void {
  const node = editor.api.node([...path])?.[0];
  const dom = node ? editor.api.toDOMNode(node) : undefined;
  if (dom instanceof HTMLElement) {
    dom.scrollIntoView({ block: "nearest" });
  }
}

const REVEAL_ATTEMPTS = 20;

function revealDefinitionWhenRendered(editor: SlateEditor, id: string, attempts: number): void {
  setTimeout(() => {
    const entry = footnoteDefinitionEntry(editor, id);
    const node = entry === undefined ? undefined : editor.api.node(entry[1])?.[0];
    const dom = node === undefined ? undefined : editor.api.toDOMNode(node);
    if (dom === undefined) {
      if (attempts > 0) {
        revealDefinitionWhenRendered(editor, id, attempts - 1);
      }
      return;
    }

    scrollPathIntoView(editor, entry?.[1] ?? []);
    editor.tf.focus();
  }, 0);
}

// Edit mode moves the caret to the end of the definition and keeps focus. Read-only only scrolls.
export function jumpToFootnoteDefinition(editor: SlateEditor, footnoteId: string): boolean {
  const entry = footnoteDefinitionEntry(editor, footnoteId);
  if (entry === undefined) {
    return false;
  }

  if (editor.dom.readOnly === true) {
    scrollPathIntoView(editor, entry[1]);
    return true;
  }

  if (!selectFootnoteDefinition(editor, footnoteId)) {
    return false;
  }
  scrollPathIntoView(editor, entry[1]);
  editor.tf.focus();
  return true;
}

// Jumps back to the first reference. In edit mode the caret lands right after it.
export function jumpToFootnoteReference(editor: SlateEditor, footnoteId: string): boolean {
  const entry = footnoteReferenceEntries(editor, footnoteId)[0];
  if (entry === undefined) {
    return false;
  }

  if (editor.dom.readOnly === true) {
    scrollPathIntoView(editor, entry[1]);
    return true;
  }

  if (!selectFootnoteReference(editor, footnoteId)) {
    return false;
  }
  scrollPathIntoView(editor, entry[1]);
  editor.tf.focus();
  return true;
}

// A click on a reference whose definition is missing only selects that reference.
export function selectMissingFootnoteReference(editor: SlateEditor, path: readonly number[]): void {
  if (editor.dom.readOnly === true) {
    return;
  }
  selectAfterFootnoteReference(editor, [...path]);
  editor.tf.focus();
}

type FootnoteKeyEvent = {
  key: string;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
  defaultPrevented: boolean;
  preventDefault: () => void;
};

// Enter on a selected reference jumps to its definition, the same way the date chip opens.
export function onFootnoteRefKeyDown(editor: SlateEditor, event: FootnoteKeyEvent): void {
  if (
    event.defaultPrevented ||
    event.key !== "Enter" ||
    event.shiftKey ||
    event.metaKey ||
    event.ctrlKey ||
    event.altKey ||
    editor.dom.readOnly === true ||
    blockSelectionActive(editor)
  ) {
    return;
  }

  const ref = editor.api.above({
    match: (node) => ElementApi.isElement(node) && node.type === FOOTNOTE_REF_KEY,
  });
  if (ref === undefined || !ElementApi.isElement(ref[0]) || typeof ref[0].footnoteId !== "string") {
    return;
  }

  event.preventDefault();
  jumpToFootnoteDefinition(editor, ref[0].footnoteId);
}

// Runs from the registered Mod+Enter shortcut. True when the caret is in a definition, which
// consumes the key whether or not a reference exists.
export function jumpFromCaretDefinition(editor: SlateEditor): boolean {
  const block = editor.api.block();
  if (
    block === undefined ||
    !ElementApi.isElement(block[0]) ||
    block[0].type !== FOOTNOTE_DEF_KEY
  ) {
    return false;
  }

  const id = footnoteDefinitionIdAt(editor, block[1]);
  if (id !== undefined) {
    jumpToFootnoteReference(editor, id);
  }
  return true;
}

// Mod+Enter inside a definition jumps back to its first reference.
export function onFootnoteDefKeyDown(editor: SlateEditor, event: FootnoteKeyEvent): void {
  if (
    event.defaultPrevented ||
    event.key !== "Enter" ||
    event.shiftKey ||
    event.altKey ||
    !(event.metaKey || event.ctrlKey) ||
    editor.dom.readOnly === true ||
    blockSelectionActive(editor)
  ) {
    return;
  }

  const block = editor.api.block();
  if (
    block === undefined ||
    !ElementApi.isElement(block[0]) ||
    block[0].type !== FOOTNOTE_DEF_KEY
  ) {
    return;
  }
  const id = block[0].footnoteId;
  if (typeof id !== "string") {
    return;
  }

  event.preventDefault();
  jumpToFootnoteReference(editor, id);
}

// The slash query goes and the reference and definition arrive as one undo step.
export const insertSlashFootnote: EditorCommand<{ start: Point; end: Point }> = {
  id: "inline.footnote.slash",
  label: "Footnote",
  group: "insert",
  isEnabled: (editor) => footnoteInsertAllowed(editor),
  run: (editor, { start, end }) => {
    editor.tf.delete({ at: { anchor: start, focus: end } });
    insertFootnote.run(editor, undefined);

    // The caret is in the new definition. Its DOM node appears on a later render, so the reveal
    // retries on short timeouts until the node exists, then does the same scroll and focus as a
    // reference click.
    const block = editor.api.block();
    const id =
      block !== undefined && ElementApi.isElement(block[0]) && block[0].type === FOOTNOTE_DEF_KEY
        ? footnoteDefinitionIdAt(editor, block[1])
        : undefined;
    if (id !== undefined) {
      revealDefinitionWhenRendered(editor, id, REVEAL_ATTEMPTS);
    }
  },
};
