import { useEffect, type ReactNode } from "react";
import { Bookmark, Link, SquarePlay } from "lucide-react";
import { useEditorReadOnly, useEditorRef, usePluginOption } from "platejs/react";

import { Popover, PopoverAnchor, PopoverContent } from "@/components/popover";

import { anchorContext, rangeContextElement, rangeRect, virtualAnchor } from "./anchor-rect";
import { EditorTextButton } from "./block-toolbar";

import { runEditorCommand } from "../../lib/commands/editor-commands";
import {
  applyPasteUrlAction,
  clearPasteUrlOffer,
  pasteUrlActionsFor,
  pasteUrlPlugin,
} from "../../lib/paste/editor-paste-url";

export function PasteUrlMenu() {
  const editor = useEditorRef();
  const readOnly = useEditorReadOnly();
  const offer = usePluginOption(pasteUrlPlugin, "offer");
  const actions = offer === undefined ? [] : pasteUrlActionsFor(editor, offer.url);
  const virtualRef = virtualAnchor(
    () => rangeRect(pasteDomRange(editor)),
    () => anchorContext(rangeContextElement(pasteDomRange(editor))),
  );

  useEffect(() => {
    if (readOnly && offer !== undefined) {
      clearPasteUrlOffer(editor);
    }
  }, [editor, offer, readOnly]);

  useEffect(() => {
    if (readOnly || offer === undefined) {
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
  }, [editor, offer, readOnly]);

  if (readOnly || offer === undefined || actions.length === 0) {
    return null;
  }

  return (
    <Popover open>
      <PopoverAnchor virtualRef={virtualRef} />
      <PopoverContent
        data-paste-url-menu=""
        aria-label="Paste options"
        side="bottom"
        align="start"
        sideOffset={4}
        collisionPadding={8}
        hideWhenDetached
        onOpenAutoFocus={(event) => {
          event.preventDefault();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
        }}
        className="w-auto gap-1 p-1"
      >
        {actions.map((action) => (
          <EditorTextButton
            key={action.id}
            variant="outline"
            label={action.label}
            icon={pasteActionIcon(action.id)}
            className="w-full justify-start"
            onMouseDown={(event) => {
              event.preventDefault();
            }}
            onClick={() => {
              runEditorCommand(editor, applyPasteUrlAction, action.id);
            }}
          />
        ))}
        <EditorTextButton
          variant="outline"
          label="Keep as link"
          icon={<Link aria-hidden="true" />}
          data-default="true"
          className="w-full justify-start"
          onMouseDown={(event) => {
            event.preventDefault();
          }}
          onClick={() => {
            clearPasteUrlOffer(editor);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

function pasteDomRange(editor: ReturnType<typeof useEditorRef>): Range | null {
  if (!editor.selection) {
    return null;
  }

  return editor.api.toDOMRange(editor.selection) ?? null;
}

function pasteActionIcon(id: string): ReactNode {
  if (id === "bookmark") {
    return <Bookmark aria-hidden="true" />;
  }

  if (id === "embed") {
    return <SquarePlay aria-hidden="true" />;
  }

  return <Link aria-hidden="true" />;
}
