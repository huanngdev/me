import { lazy, Suspense, useEffect } from "react";
import { CalendarCheck, Trash2 } from "lucide-react";
import { useEditorReadOnly, useEditorRef, usePluginOption } from "platejs/react";

import { Popover, PopoverAnchor, PopoverContent } from "@/components/popover";

import { todayStoredDate } from "../../lib/features/editor-date-value";
import { inlineDateEntry } from "../../lib/features/editor-inline-date";
import {
  closeInlineDateEditor,
  inlineDateUiPlugin,
  pickInlineDate,
  removeInlineDateFromPopover,
} from "../../lib/plugins/editor-inline-date-ui";
import { anchorContext, elementRect, virtualAnchor } from "./anchor-rect";
import { EditorIconButton, EditorTextButton } from "./block-toolbar";

const InlineDateCalendar = lazy(() => import("./inline-date-calendar"));

// The node's own chip, found through the editor so no ref is read during render.
function inlineDateNodeDom(
  editor: ReturnType<typeof useEditorRef>,
  id: string,
): HTMLElement | null {
  const entry = inlineDateEntry(editor, id);
  if (entry === undefined) {
    return null;
  }

  const dom: unknown = editor.api.toDOMNode(entry[0]);
  if (!(dom instanceof HTMLElement)) {
    return null;
  }

  return dom.querySelector("[data-inline-date]");
}

// Picks a day, Today, or removes the date. Each choice writes once and closes.
export function InlineDatePopover({ id }: { id: string }) {
  "use no memo";

  const editor = useEditorRef();
  const readOnly = useEditorReadOnly();
  const editingId = usePluginOption(inlineDateUiPlugin, "editingId");
  const mine = !readOnly && id.length > 0 && editingId === id;
  const stored = inlineDateEntry(editor, id)?.[0].date;
  const storedText = typeof stored === "string" ? stored : "";
  const virtualRef = virtualAnchor(
    () => elementRect(inlineDateNodeDom(editor, id)),
    () => anchorContext(inlineDateNodeDom(editor, id)),
  );

  // A press outside the popover and the chip closes it without writing.
  useEffect(() => {
    if (!mine) {
      return;
    }

    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target;
      if (target instanceof Node) {
        if (inlineDateNodeDom(editor, id)?.contains(target) === true) {
          return;
        }
        if (target instanceof Element && target.closest("[data-inline-date-popover]") !== null) {
          return;
        }
      }

      closeInlineDateEditor(editor);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [editor, id, mine]);

  if (!mine) {
    return null;
  }

  return (
    <Popover open>
      <PopoverAnchor virtualRef={virtualRef} />
      <PopoverContent
        data-inline-date-popover=""
        aria-label="Date"
        side="bottom"
        align="start"
        sideOffset={4}
        collisionPadding={8}
        hideWhenDetached
        className="w-auto p-2"
        // The calendar's own autoFocus moves focus to its day, so the default focus move is skipped.
        onOpenAutoFocus={(event) => {
          event.preventDefault();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
        }}
        onKeyDown={(event) => {
          // The editor must not see keys typed here. Escape is handled in this popover.
          event.stopPropagation();
          if (event.key === "Escape") {
            event.preventDefault();
            closeInlineDateEditor(editor);
          }
        }}
        onKeyUp={(event) => {
          event.stopPropagation();
        }}
        onCompositionStart={(event) => {
          event.stopPropagation();
        }}
        onCompositionUpdate={(event) => {
          event.stopPropagation();
        }}
        onCompositionEnd={(event) => {
          event.stopPropagation();
        }}
        onPaste={(event) => {
          event.stopPropagation();
        }}
        onCut={(event) => {
          event.stopPropagation();
        }}
        onCopy={(event) => {
          event.stopPropagation();
        }}
        onPointerDown={(event) => {
          event.stopPropagation();
        }}
        onMouseDown={(event) => {
          event.stopPropagation();
        }}
      >
        <div className="flex flex-col gap-2">
          <Suspense fallback={<div aria-hidden="true" className="h-64 w-[212px]" />}>
            <InlineDateCalendar
              stored={storedText}
              onPick={(date) => {
                pickInlineDate(editor, id, date);
              }}
            />
          </Suspense>
          <div className="flex items-center justify-between gap-2">
            <EditorTextButton
              variant="ghost"
              label="Today"
              icon={<CalendarCheck aria-hidden="true" />}
              onClick={() => {
                pickInlineDate(editor, id, todayStoredDate());
              }}
            />
            <EditorIconButton
              variant="destructive"
              label="Remove date"
              icon={<Trash2 aria-hidden="true" />}
              onClick={() => {
                removeInlineDateFromPopover(editor, id);
              }}
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
