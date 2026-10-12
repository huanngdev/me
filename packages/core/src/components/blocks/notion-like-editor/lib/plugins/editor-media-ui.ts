import { ElementApi, createSlatePlugin, type SlateEditor } from "platejs";
import { toPlatePlugin } from "platejs/react";

import { IMAGE_KEY } from "../features/editor-image";
import { findBlockById } from "../features/editor-synced-block";
import type { UploadController } from "../features/editor-upload-controller";
import { blockSelectionActive } from "./editor-block-selection";

// Which media block has its source popover or action popover open. Each holds one block id, or
// the empty string when closed. Any block type can use them.
type MediaUiOptions = {
  source: string;
  actions: string;
};

function mediaUiOptions(): MediaUiOptions {
  return { source: "", actions: "" };
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

export function uploadControllerOf(editor: SlateEditor): UploadController | null {
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

// Opens the source popover for one block. Only one popover of each kind is open at a time.
export function openMediaSource(editor: SlateEditor, blockId: string): void {
  if (
    editor.dom.readOnly === true ||
    blockId.length === 0 ||
    findBlockById(editor, blockId) === undefined
  ) {
    return;
  }

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

  editor.setOption(mediaUiPlugin, "source", "");
  editor.setOption(mediaUiPlugin, "actions", blockId);
}

export function closeMediaActions(editor: SlateEditor): void {
  if (mediaActionsBlockId(editor) === "") {
    return;
  }

  editor.setOption(mediaUiPlugin, "actions", "");
}

// Selects the block, so its popover and focus return both point at it.
export function selectMediaBlock(editor: SlateEditor, blockId: string): void {
  const entry = findBlockById(editor, blockId);
  if (entry !== undefined) {
    editor.tf.select(entry[1]);
  }
}

// The image block that holds the selection, or the empty string.
export function selectedImageId(editor: SlateEditor): string {
  const entry = editor.api.above({
    match: (node) => ElementApi.isElement(node) && node.type === IMAGE_KEY,
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

  const id = selectedImageId(editor);
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
