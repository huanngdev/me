import { useEffect, type MouseEvent as ReactMouseEvent, type RefObject } from "react";
import { useEditorReadOnly, useEditorRef, useEditorSelector, usePluginOption } from "platejs/react";

import type { SlateEditor } from "platejs";

import {
  cancelMediaHoverClose,
  cancelMediaOpen,
  clearMediaHover,
  closeMediaActions,
  mediaActionsBlockId,
  mediaHoverBlockId,
  mediaUiPlugin,
  scheduleMediaHover,
  scheduleMediaHoverClose,
  selectMediaBlock,
  selectedMediaId,
  type MediaPoint,
} from "../../lib/plugins/editor-media-ui";

// The pointer position of a mouse event, for the hover timers.
function pointOf(event: { clientX: number; clientY: number }): MediaPoint {
  return { x: event.clientX, y: event.clientY };
}

// Clicks and keys on these controls belong to the control, not to the media card. A player is a control:
// the block marks its player with data-media-control, so every part of it counts, including the sliders
// of the audio player and the video surface.
export function isControlTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest(
      "input, textarea, button, a, video, audio, [role='separator'], [role='slider'], [data-media-control]",
    ) !== null
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

function isMediaElementEvent(target: EventTarget | null): boolean {
  return target instanceof Element && ["AUDIO", "VIDEO", "SOURCE"].includes(target.tagName);
}

// A media element reports its load events on itself, and most of them do not bubble. The player renders
// the element, so React does not hear them. A capture listener on the wrapper around the player does, and
// `onEvent` gets each `type` event from the element or its source while `active` is true.
export function useMediaElementEvent(
  wrapperRef: RefObject<HTMLElement | null>,
  type: "error" | "loadedmetadata",
  active: boolean,
  onEvent: (event: Event) => void,
): void {
  useEffect(() => {
    const node = wrapperRef.current;
    if (node === null || !active) {
      return;
    }

    const onMediaEvent = (event: Event): void => {
      if (isMediaElementEvent(event.target)) {
        onEvent(event);
      }
    };
    node.addEventListener(type, onMediaEvent, true);
    return () => {
      node.removeEventListener(type, onMediaEvent, true);
    };
  }, [wrapperRef, type, active, onEvent]);
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

// The action toolbar of a media block opens while the pointer rests on the block, and closes once the
// pointer has left both the block and the toolbar. `active` says the block has actions now. A press
// that began elsewhere does not open it; the release over the block does.
export function useMediaHover(
  anchorRef: RefObject<HTMLDivElement | null>,
  id: string,
  active: boolean,
): void {
  const editor = useEditorRef();

  useEffect(() => {
    const node = anchorRef.current;
    if (node === null || !active) {
      return;
    }

    const onEnter = (event: MouseEvent): void => {
      if (event.buttons !== 0) {
        return;
      }

      // Back over the block that is hovered, so its pending close is dropped.
      if (mediaHoverBlockId(editor) === id) {
        cancelMediaHoverClose(editor);
      }
      scheduleMediaHover(editor, id, pointOf(event));
    };
    // The browser can report the toolbar's enter before this leave, so a leave into the toolbar is ignored.
    const onLeave = (event: MouseEvent): void => {
      cancelMediaOpen(editor, id);
      const next = event.relatedTarget;
      if (next instanceof Element && next.closest("[data-media-actions]") !== null) {
        return;
      }

      scheduleMediaHoverClose(editor, pointOf(event));
    };
    // Moving over the block restarts the rest, so the open uses the pointer's latest position.
    const onMove = (event: MouseEvent): void => {
      if (event.buttons === 0 && mediaHoverBlockId(editor) !== id) {
        scheduleMediaHover(editor, id, pointOf(event));
      }
    };
    const onDown = (): void => {
      cancelMediaOpen(editor, id);
    };
    const onUp = (event: MouseEvent): void => {
      scheduleMediaHover(editor, id, pointOf(event));
    };
    node.addEventListener("mouseenter", onEnter);
    node.addEventListener("mouseleave", onLeave);
    node.addEventListener("mousemove", onMove);
    node.addEventListener("mousedown", onDown);
    node.addEventListener("mouseup", onUp);
    return () => {
      node.removeEventListener("mouseenter", onEnter);
      node.removeEventListener("mouseleave", onLeave);
      node.removeEventListener("mousemove", onMove);
      node.removeEventListener("mousedown", onDown);
      node.removeEventListener("mouseup", onUp);
      cancelMediaOpen(editor, id);
    };
  }, [editor, id, active, anchorRef]);

  // Leaving the active state, or the block, closes its hover toolbar.
  useEffect(
    () => () => {
      if (mediaHoverBlockId(editor) === id) {
        clearMediaHover(editor);
      }
    },
    [editor, id, active],
  );
}

// Whether a block's action toolbar is open. `explicit` is true when a click or a key opened it. That
// toolbar takes focus and stays open until it is dismissed. A hover toolbar takes neither.
export function useMediaActionsOpen(id: string): { open: boolean; explicit: boolean } {
  const actions = usePluginOption(mediaUiPlugin, "actions");
  const hovered = usePluginOption(mediaUiPlugin, "hoverId");
  const explicit = id.length > 0 && actions === id;
  return { open: explicit || (id.length > 0 && hovered === id), explicit };
}

// The hover handlers of an action toolbar. The toolbar is a portal, so the pointer crosses the gap to
// it: entering it cancels a pending close, and leaving it schedules one.
export function mediaActionsHoverProps(editor: SlateEditor) {
  return {
    onMouseEnter: () => {
      cancelMediaHoverClose(editor);
    },
    onMouseLeave: (event: ReactMouseEvent<HTMLElement>) => {
      scheduleMediaHoverClose(editor, pointOf(event));
    },
  };
}
