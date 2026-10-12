import { useEffect, type RefObject } from "react";
import { useEditorReadOnly, useEditorRef, useEditorSelector } from "platejs/react";

import type { SlateEditor } from "platejs";

import {
  closeMediaActions,
  mediaActionsBlockId,
  selectMediaBlock,
  selectedMediaId,
} from "../../lib/plugins/editor-media-ui";

// Clicks and keys on these controls belong to the control, not to the media card. A video or audio
// player is a control, so a click on it does not select the block.
export function isControlTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest("input, textarea, button, a, video, audio, [role='separator']") !== null
  );
}

type PlayerKeyEvent = {
  key: string;
  preventDefault: () => void;
  stopPropagation: () => void;
};

// Keys pressed in a player belong to the player, so the editor never sees them. Escape also returns
// focus to the editor.
export function onPlayerKeyDown(editor: SlateEditor, event: PlayerKeyEvent): void {
  event.stopPropagation();
  if (event.key === "Escape") {
    event.preventDefault();
    editor.tf.focus();
  }
}

export function onPlayerKeyUp(event: Pick<PlayerKeyEvent, "stopPropagation">): void {
  event.stopPropagation();
}

// The editor selects a void block when its inner element is clicked. A click on the player stops here,
// so the block under the player keeps the selection it has.
export function onPlayerClick(event: { stopPropagation: () => void }): void {
  event.stopPropagation();
}

// Mouse-down on the card keeps the caret where it is, and a click selects its block. The block is not
// selected on mouse-down: selecting scrolls a row near the bottom of the editor into view, so it moves
// out from under the pointer, and the click is lost. It runs only while `active`, which is true when
// the card is rendered and the editor is writable.
export function useMediaCardSelect(
  cardRef: RefObject<HTMLDivElement | null>,
  id: string,
  active: boolean,
): void {
  const editor = useEditorRef();

  useEffect(() => {
    const node = cardRef.current;
    if (node === null || !active) {
      return;
    }

    // The browser's default mousedown moves the caret to the nearest text. A media card has no text of
    // its own, so the caret would land in a neighbouring block, the card would lose its selection, and
    // its action popover would close. The default is cancelled, so the card keeps the selection.
    const onMouseDown = (event: MouseEvent): void => {
      if (event.button !== 0 || isControlTarget(event.target)) {
        return;
      }

      event.preventDefault();
    };
    const onClick = (event: MouseEvent): void => {
      if (event.button !== 0 || isControlTarget(event.target)) {
        return;
      }

      selectMediaBlock(editor, id);
    };
    node.addEventListener("mousedown", onMouseDown);
    node.addEventListener("click", onClick);
    return () => {
      node.removeEventListener("mousedown", onMouseDown);
      node.removeEventListener("click", onClick);
    };
  }, [editor, id, active, cardRef]);
}

// The action popover of a media block closes when its block loses the selection, when the editor
// turns read-only, and when the block is removed. `open` says whether this block's popover is open.
export function useMediaActionsLifecycle(id: string, open: boolean): void {
  const editor = useEditorRef();
  const readOnly = useEditorReadOnly();
  const selection = useEditorSelector((current) => current.selection, []);

  useEffect(() => {
    if (!open) {
      return;
    }

    if (readOnly || selection === null || selectedMediaId(editor) !== id) {
      closeMediaActions(editor);
    }
  }, [editor, id, open, readOnly, selection]);

  useEffect(
    () => () => {
      if (mediaActionsBlockId(editor) === id) {
        closeMediaActions(editor);
      }
    },
    [editor, id],
  );
}
