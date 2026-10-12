import { useEffect, type RefObject } from "react";
import { useEditorReadOnly, useEditorRef, useEditorSelector } from "platejs/react";

import {
  closeMediaActions,
  mediaActionsBlockId,
  selectMediaBlock,
  selectedMediaId,
} from "../../lib/plugins/editor-media-ui";

// Clicks and keys on these controls belong to the control, not to the media card.
export function isControlTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest("input, textarea, button, a, [role='separator']") !== null
  );
}

// Mouse-down on the card selects its block, as a bookmark card does. It runs only while `active`,
// which is true when the card is rendered and the editor is writable.
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
      selectMediaBlock(editor, id);
    };
    node.addEventListener("mousedown", onMouseDown);
    return () => {
      node.removeEventListener("mousedown", onMouseDown);
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
