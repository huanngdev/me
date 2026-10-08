import { useEffect } from "react";
import { useEditorRef, usePluginOption } from "platejs/react";

import { Popover, PopoverAnchor, PopoverContent } from "@/components/popover";

import { runEditorCommand } from "./editor-commands";
import {
  applyPasteUrlAction,
  clearPasteUrlOffer,
  pasteUrlActions,
  pasteUrlPlugin,
} from "./editor-embed";

export function PasteUrlMenu() {
  const editor = useEditorRef();
  const offer = usePluginOption(pasteUrlPlugin, "offer");
  const actions =
    offer === undefined ? [] : pasteUrlActions.filter((action) => action.match(offer.url));

  useEffect(() => {
    if (offer === undefined) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        clearPasteUrlOffer(editor);
      }
    };
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target;
      if (target instanceof Element && target.closest("[data-paste-url-menu]") !== null) {
        return;
      }

      clearPasteUrlOffer(editor);
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [editor, offer]);

  if (offer === undefined || actions.length === 0) {
    return null;
  }

  const rect = selectionRect();

  return (
    <Popover open>
      <PopoverAnchor asChild>
        <span
          data-paste-url-anchor=""
          style={{
            position: "fixed",
            top: rect.top,
            left: rect.left,
            width: 1,
            height: 1,
          }}
        />
      </PopoverAnchor>
      <PopoverContent
        data-paste-url-menu=""
        align="start"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
        }}
        className="w-auto gap-1 p-1"
      >
        {actions.map((action) => (
          <button
            key={action.id}
            type="button"
            className="hover:bg-muted block w-full rounded-md px-2 py-1 text-left text-sm"
            onMouseDown={(event) => {
              event.preventDefault();
            }}
            onClick={() => {
              runEditorCommand(editor, applyPasteUrlAction, action.id);
            }}
          >
            {action.label}
          </button>
        ))}
        <button
          type="button"
          data-default="true"
          className="hover:bg-muted block w-full rounded-md px-2 py-1 text-left text-sm"
          onMouseDown={(event) => {
            event.preventDefault();
          }}
          onClick={() => {
            clearPasteUrlOffer(editor);
          }}
        >
          Keep as text
        </button>
      </PopoverContent>
    </Popover>
  );
}

function selectionRect(): { top: number; left: number } {
  if (typeof window === "undefined") {
    return { top: 0, left: 0 };
  }

  const selection = window.getSelection();
  if (selection === null || selection.rangeCount === 0) {
    return { top: 0, left: 0 };
  }

  const rect = selection.getRangeAt(0).getBoundingClientRect();
  return { top: rect.bottom, left: rect.left };
}
