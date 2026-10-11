import { useCallback, useEffect, useRef, useState } from "react";
import { RangeApi, type TRange } from "platejs";
import { useEditorRef, useEditorSelector, usePluginOption, useReadOnly } from "platejs/react";

import { bookmarkUrlPlugin } from "../lib/plugins/editor-bookmark-popover";
import { editorIsComposing } from "../lib/plugins/editor-mention";
import { holdSelectionHighlight, linkUiPlugin } from "../lib/plugins/editor-link";
import { slashUiPlugin } from "../lib/plugins/editor-slash";
import {
  SELECTION_TOOLBAR_MEDIA,
  editorSurfaceFlags,
  selectionToolbarPlacement,
  selectionToolbarVisible,
  type SelectionToolbarSnapshot,
} from "../lib/features/editor-selection-toolbar";
const SELECTION_KEYS = new Set([
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "Home",
  "End",
  "PageUp",
  "PageDown",
]);

type DomFlags = {
  blockMenuOpen: boolean;
  addMenuOpen: boolean;
  dragging: boolean;
};

const CLOSED_DOM: DomFlags = {
  blockMenuOpen: false,
  addMenuOpen: false,
  dragging: false,
};

function cloneRange(range: TRange): TRange {
  return {
    anchor: { path: [...range.anchor.path], offset: range.anchor.offset },
    focus: { path: [...range.focus.path], offset: range.focus.offset },
  };
}

function readDomFlags(): DomFlags {
  if (typeof document === "undefined") {
    return CLOSED_DOM;
  }

  return {
    blockMenuOpen: document.querySelector("[data-block-menu]") !== null,
    addMenuOpen: document.querySelector("[data-block-add-menu]") !== null,
    dragging: document.body.hasAttribute("data-block-dragging"),
  };
}

function sameFlags(left: DomFlags, right: DomFlags): boolean {
  return (
    left.blockMenuOpen === right.blockMenuOpen &&
    left.addMenuOpen === right.addMenuOpen &&
    left.dragging === right.dragging
  );
}

export function useSelectionToolbar() {
  "use no memo";

  const editor = useEditorRef();
  const readOnly = useReadOnly();
  const linkMode = usePluginOption(linkUiPlugin, "mode");
  const slashOpen = usePluginOption(slashUiPlugin, "open");
  const bookmarkOpen = usePluginOption(bookmarkUrlPlugin, "open");
  const expandedKey = useEditorSelector((instance) => {
    const selection = instance.selection;
    if (!selection || RangeApi.isCollapsed(selection)) {
      return "";
    }

    return `${instance.operations.length}:${JSON.stringify(selection)}`;
  }, []);
  const [pointerHeld, setPointerHeld] = useState(false);
  const [keyboardSelecting, setKeyboardSelecting] = useState(false);
  const [composing, setComposing] = useState(false);
  const [focus, setFocus] = useState<"editor" | "toolbar" | "other">("other");
  const [armed, setArmed] = useState(false);
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [placement, setPlacement] = useState<"floating" | "docked">("floating");
  const [domFlags, setDomFlags] = useState<DomFlags>(CLOSED_DOM);
  const saved = useRef<TRange | null>(null);

  const captureRange = useCallback(() => {
    const selection = editor.selection;
    if (selection && !RangeApi.isCollapsed(selection)) {
      saved.current = cloneRange(selection);
    }
  }, [editor]);

  useEffect(() => {
    if (expandedKey.length === 0 || focus !== "editor") {
      return;
    }

    captureRange();
  }, [captureRange, expandedKey, focus]);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") {
      return;
    }

    const query = window.matchMedia(SELECTION_TOOLBAR_MEDIA);
    const update = (): void => {
      setPlacement(selectionToolbarPlacement(query.matches));
    };
    update();
    query.addEventListener("change", update);
    return () => {
      query.removeEventListener("change", update);
    };
  }, []);

  useEffect(() => {
    const hold = (event: PointerEvent): void => {
      const target = event.target;
      const inside = target instanceof Element && target.closest("[data-slate-editor]") !== null;
      setPointerHeld((current) => (inside ? true : current));
    };
    const release = (): void => {
      setPointerHeld(false);
    };
    document.addEventListener("pointerdown", hold);
    document.addEventListener("pointerup", release);
    document.addEventListener("pointercancel", release);
    return () => {
      document.removeEventListener("pointerdown", hold);
      document.removeEventListener("pointerup", release);
      document.removeEventListener("pointercancel", release);
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target;
      const inEditor = target instanceof Element && target.closest("[data-slate-editor]") !== null;
      if (!inEditor || !event.shiftKey || !SELECTION_KEYS.has(event.key)) {
        return;
      }

      setKeyboardSelecting(true);
    };
    const onKeyUp = (): void => {
      setKeyboardSelecting(false);
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  useEffect(() => {
    const onStart = (event: Event): void => {
      const target = event.target;
      if (target instanceof Element && target.closest("[data-slate-editor]") !== null) {
        setComposing(true);
      }
    };
    const onEnd = (): void => {
      setComposing(false);
    };
    document.addEventListener("compositionstart", onStart);
    document.addEventListener("compositionend", onEnd);
    return () => {
      document.removeEventListener("compositionstart", onStart);
      document.removeEventListener("compositionend", onEnd);
    };
  }, []);

  useEffect(() => {
    const sync = (): void => {
      const active = document.activeElement;
      const inToolbar =
        active instanceof Element &&
        active.closest("[data-selection-toolbar], [data-selection-toolbar-portal]") !== null;
      const inEditor = active instanceof Element && active.closest("[data-slate-editor]") !== null;
      const inLink = active instanceof Element && active.closest("[data-link-popover]") !== null;
      if (inToolbar || inEditor) {
        setArmed(true);
      } else if (!inLink && active instanceof Element && active !== document.body) {
        setArmed(false);
      }
      setFocus(inToolbar ? "toolbar" : inEditor ? "editor" : "other");
    };
    const later = (): void => {
      queueMicrotask(sync);
    };
    document.addEventListener("focusin", later);
    document.addEventListener("focusout", later);
    sync();
    return () => {
      document.removeEventListener("focusin", later);
      document.removeEventListener("focusout", later);
    };
  }, []);

  useEffect(() => {
    if (expandedKey.length === 0) {
      return;
    }

    const sync = (): void => {
      const next = readDomFlags();
      setDomFlags((current) => (sameFlags(current, next) ? current : next));
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-block-dragging"],
    });
    return () => {
      observer.disconnect();
    };
  }, [expandedKey]);

  const surfaces = expandedKey.length === 0 ? null : editorSurfaceFlags(editor);
  const snapshot: SelectionToolbarSnapshot = {
    readOnly: readOnly || editor.dom.readOnly === true,
    composing: composing || editorIsComposing(editor),
    pointerHeld,
    keyboardSelecting,
    dismissed: dismissedFor !== null && dismissedFor === expandedKey,
    editorFocused: focus === "editor" || armed,
    toolbarFocused: focus === "toolbar" || menuOpen,
    linkPopoverOpen: linkMode !== "closed" || surfaces?.linkPopoverOpen === true,
    slashOpen: slashOpen === true || surfaces?.slashOpen === true,
    bookmarkOpen: bookmarkOpen === true || surfaces?.bookmarkOpen === true,
    mentionOpen: surfaces?.mentionOpen === true,
    blockMenuOpen: domFlags.blockMenuOpen,
    addMenuOpen: domFlags.addMenuOpen,
    dragging: domFlags.dragging,
  };
  const visible = menuOpen || (expandedKey.length > 0 && selectionToolbarVisible(editor, snapshot));

  useEffect(() => {
    if (!menuOpen || !saved.current || RangeApi.isCollapsed(saved.current)) {
      return;
    }
    if (editor.selection && !RangeApi.isCollapsed(editor.selection)) {
      return;
    }
    const range = saved.current;
    editor.tf.withoutSaving(() => {
      editor.tf.select(range);
    });
  }, [editor, expandedKey, menuOpen]);
  const toolbarFocused = focus === "toolbar" || menuOpen;

  useEffect(() => {
    if (!visible || !toolbarFocused) {
      holdSelectionHighlight(editor, null);
      return;
    }

    holdSelectionHighlight(editor, saved.current);
  }, [editor, toolbarFocused, visible, expandedKey]);

  return {
    editor,
    placement,
    visible,
    expandedKey,
    menuOpen,
    setMenuOpen,
    captureRange,
    savedRange: () => saved.current,
    dismiss: () => {
      setDismissedFor(expandedKey);
    },
  };
}
