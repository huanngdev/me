import { ElementApi, createSlatePlugin, type SlateEditor } from "platejs";
import { toPlatePlugin } from "platejs/react";

import { isMediaBlockType } from "../features/editor-media-source";
import { findBlockById } from "../features/editor-synced-block";
import type { UploadController } from "../features/editor-upload-controller";
import { blockSelectionActive } from "./editor-block-selection";
import { featureEnabled } from "./editor-config";

// Which media block has its source popover, action popover or hover toolbar open. Each holds one
// block id, or the empty string when closed. Any block type can use them.
type MediaUiOptions = {
  source: string;
  actions: string;
  hoverId: string;
};

function mediaUiOptions(): MediaUiOptions {
  return { source: "", actions: "", hoverId: "" };
}

function isEditorOnChange(value: unknown): value is (options?: { operation?: unknown }) => void {
  return typeof value === "function";
}

export const mediaUiPlugin = createSlatePlugin({
  key: "mediaUi",
  options: mediaUiOptions(),
}).overrideEditor(({ editor }) => {
  const { onChange } = editor;
  if (isEditorOnChange(onChange)) {
    editor.onChange = (options?: { operation?: unknown }) => {
      onChange(options);
      const readOnly = editor.dom.readOnly === true;
      if (readOnly) {
        closeMediaSource(editor);
        closeMediaActions(editor);
      }
      reconcileUploads(editor, readOnly);
    };
  }
  return { transforms: {} };
});

// The upload controller of the mounted file scope. Null when no adapter is set.
const controllers = new WeakMap<SlateEditor, UploadController>();

export function attachUploadController(editor: SlateEditor, controller: UploadController | null) {
  if (controller === null) {
    controllers.delete(editor);
    return;
  }

  controllers.set(editor, controller);
}

// With media off there is no upload controller, the same as with no adapter.
export function uploadControllerOf(editor: SlateEditor): UploadController | null {
  if (!featureEnabled(editor, "media")) {
    return null;
  }
  return controllers.get(editor) ?? null;
}

// Cancels the uploads whose block is gone, and every upload when the editor is read-only. A block
// that only moved keeps its id, so its upload is kept. With no uploads this does no walk.
export function reconcileUploads(editor: SlateEditor, readOnly: boolean): void {
  const controller = controllers.get(editor);
  if (controller === undefined) {
    return;
  }

  for (const id of controller.ids()) {
    if (readOnly || findBlockById(editor, id) === undefined) {
      controller.cancel(id);
    }
  }
}

export function mediaSourceBlockId(editor: SlateEditor): string {
  return editor.getOption(mediaUiPlugin, "source");
}

export function mediaActionsBlockId(editor: SlateEditor): string {
  return editor.getOption(mediaUiPlugin, "actions");
}

export function mediaHoverBlockId(editor: SlateEditor): string {
  return editor.getOption(mediaUiPlugin, "hoverId");
}

// The hover toolbar opens after a short rest, and closes a moment after the pointer leaves the block
// and the toolbar, so the pointer can cross the gap between them.
export const MEDIA_HOVER_OPEN_MS = 120;
export const MEDIA_HOVER_CLOSE_MS = 200;

// Each block has its own pending open, so a change to another block does not cancel it. There is one
// pending close per editor.
const openTimers = new WeakMap<SlateEditor, Map<string, ReturnType<typeof setTimeout>>>();
const closeTimers = new WeakMap<SlateEditor, ReturnType<typeof setTimeout>>();

function openTimersOf(editor: SlateEditor): Map<string, ReturnType<typeof setTimeout>> {
  const existing = openTimers.get(editor);
  if (existing !== undefined) {
    return existing;
  }

  const created = new Map<string, ReturnType<typeof setTimeout>>();
  openTimers.set(editor, created);
  return created;
}

// Where the pointer was when the event that scheduled a hover change ran. The browser can report an
// enter or a leave that the pointer did not make, after a layout change, so a timer checks this point
// against the layout at the time it fires, and not the enter or leave alone.
export type MediaPoint = { x: number; y: number };

function elementAt(point: MediaPoint | undefined): Element | null {
  if (point === undefined || typeof document.elementFromPoint !== "function") {
    return null;
  }

  return document.elementFromPoint(point.x, point.y);
}

function pointIsOverBlock(point: MediaPoint | undefined, blockId: string): boolean {
  const anchor = elementAt(point)?.closest("[data-media-anchor]");
  return anchor?.closest("[data-block-id]")?.getAttribute("data-block-id") === blockId;
}

function pointIsOverToolbar(point: MediaPoint | undefined): boolean {
  return elementAt(point)?.closest("[data-media-actions]") != null;
}

export function cancelMediaOpen(editor: SlateEditor, blockId: string): void {
  const timers = openTimersOf(editor);
  const timer = timers.get(blockId);
  if (timer === undefined) {
    return;
  }

  clearTimeout(timer);
  timers.delete(blockId);
}

export function cancelMediaHoverClose(editor: SlateEditor): void {
  const timer = closeTimers.get(editor);
  if (timer === undefined) {
    return;
  }

  clearTimeout(timer);
  closeTimers.delete(editor);
}

// Opens the source popover for one block. Only one popover of each kind is open at a time.
export function openMediaSource(editor: SlateEditor, blockId: string): void {
  if (
    editor.dom.readOnly === true ||
    blockId.length === 0 ||
    findBlockById(editor, blockId) === undefined
  ) {
    return;
  }

  clearMediaHover(editor);
  editor.setOption(mediaUiPlugin, "actions", "");
  editor.setOption(mediaUiPlugin, "source", blockId);
}

export function closeMediaSource(editor: SlateEditor): void {
  if (mediaSourceBlockId(editor) === "") {
    return;
  }

  editor.setOption(mediaUiPlugin, "source", "");
}

export function openMediaActions(editor: SlateEditor, blockId: string): void {
  if (
    editor.dom.readOnly === true ||
    blockId.length === 0 ||
    findBlockById(editor, blockId) === undefined
  ) {
    return;
  }

  clearMediaHover(editor);
  editor.setOption(mediaUiPlugin, "source", "");
  editor.setOption(mediaUiPlugin, "actions", blockId);
}

export function closeMediaActions(editor: SlateEditor): void {
  clearMediaHover(editor);
  if (mediaActionsBlockId(editor) === "") {
    return;
  }

  editor.setOption(mediaUiPlugin, "actions", "");
}

function setMediaHover(editor: SlateEditor, blockId: string): void {
  if (mediaHoverBlockId(editor) === blockId) {
    return;
  }

  editor.setOption(mediaUiPlugin, "hoverId", blockId);
}

// Drops the hover toolbar and any change still waiting to open or close it.
export function clearMediaHover(editor: SlateEditor): void {
  cancelMediaHoverClose(editor);
  for (const blockId of [...openTimersOf(editor).keys()]) {
    cancelMediaOpen(editor, blockId);
  }
  setMediaHover(editor, "");
}

// Opens the hover toolbar of one block. It does nothing while a source popover is open, or while a toolbar
// was opened by a click or Enter: that toolbar stays until its own dismissal. Hover never changes the
// explicit toolbar, and it never moves the selection or the focus.
export function openMediaHover(editor: SlateEditor, blockId: string): void {
  if (
    editor.dom.readOnly === true ||
    blockId.length === 0 ||
    findBlockById(editor, blockId) === undefined ||
    mediaSourceBlockId(editor) !== "" ||
    mediaActionsBlockId(editor) !== ""
  ) {
    return;
  }

  setMediaHover(editor, blockId);
}

// Opens the block's hover toolbar after the short rest, if the pointer is still over the block.
export function scheduleMediaHover(editor: SlateEditor, blockId: string, point: MediaPoint): void {
  cancelMediaOpen(editor, blockId);
  const timers = openTimersOf(editor);
  const timer = setTimeout(() => {
    timers.delete(blockId);
    if (pointIsOverBlock(point, blockId)) {
      openMediaHover(editor, blockId);
    }
  }, MEDIA_HOVER_OPEN_MS);
  timers.set(blockId, timer);
}

// Closes the hover toolbar once the pointer has left the block and the toolbar. A pointer that is still
// over the block, or over a media toolbar, keeps it open.
export function scheduleMediaHoverClose(editor: SlateEditor, point?: MediaPoint): void {
  cancelMediaHoverClose(editor);
  // Only the toolbar that was hovered when the close was scheduled is closed. Another block's toolbar
  // that opened since is left alone.
  const hovered = mediaHoverBlockId(editor);
  const timer = setTimeout(() => {
    closeTimers.delete(editor);
    if (hovered === "" || mediaHoverBlockId(editor) !== hovered) {
      return;
    }
    if (pointIsOverBlock(point, hovered)) {
      return;
    }
    if (pointIsOverToolbar(point)) {
      return;
    }

    setMediaHover(editor, "");
  }, MEDIA_HOVER_CLOSE_MS);
  closeTimers.set(editor, timer);
}

// Selects the block, so its popover and focus return both point at it.
export function selectMediaBlock(editor: SlateEditor, blockId: string): void {
  const entry = findBlockById(editor, blockId);
  if (entry !== undefined) {
    editor.tf.select(entry[1]);
  }
}

// The media block (image or file) that holds the selection, or the empty string.
export function selectedMediaId(editor: SlateEditor): string {
  const entry = editor.api.above({
    match: (node) => ElementApi.isElement(node) && isMediaBlockType(node.type),
  });
  if (entry === undefined || !ElementApi.isElement(entry[0])) {
    return "";
  }

  return typeof entry[0].id === "string" ? entry[0].id : "";
}

type MediaKeyEvent = {
  key: string;
  altKey?: boolean;
  shiftKey?: boolean;
  metaKey?: boolean;
  ctrlKey?: boolean;
  target?: EventTarget | null;
  preventDefault: () => void;
};

// A focused control keeps its own keys. Enter on the selected image opens its actions.
export function onMediaUiKeyDown(editor: SlateEditor, event: MediaKeyEvent): boolean {
  if (editor.dom.readOnly === true || event.key !== "Enter") {
    return false;
  }

  if (event.altKey || event.shiftKey || event.metaKey || event.ctrlKey) {
    return false;
  }

  if (mediaActionsBlockId(editor) !== "" || blockSelectionActive(editor)) {
    return false;
  }

  const target = event.target;
  if (target instanceof Element && target.closest("button, input, textarea, [role='separator']")) {
    return false;
  }

  const id = selectedMediaId(editor);
  if (id.length === 0) {
    return false;
  }

  event.preventDefault();
  openMediaActions(editor, id);
  return true;
}

// toPlatePlugin, not createSlatePlugin: a Slate plugin's handlers have no onKeyDown.
export const mediaUiPlatePlugin = toPlatePlugin(mediaUiPlugin, {
  handlers: {
    onKeyDown: ({ editor, event }) => {
      onMediaUiKeyDown(editor, event);
    },
  },
});
