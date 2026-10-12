import { useEffect, useRef } from "react";
import { Check } from "lucide-react";
import { useEditorReadOnly, useEditorRef, usePluginOption } from "platejs/react";

import { Input } from "@/components/input";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/popover";

import { isStoredEquationExpression } from "../../lib/document/editor-document-schema";
import { inlineEquationEntry } from "../../lib/features/editor-inline-equation";
import {
  commitInlineEquationEditor,
  inlineEquationUiPlugin,
  cancelInlineEquationEditor,
  setInlineEquationDraft,
} from "../../lib/plugins/editor-inline-equation-ui";
import { anchorContext, elementRect, virtualAnchor } from "./anchor-rect";
import { EditorTextButton } from "./block-toolbar";

// The node's own element, found through the editor so no ref is read during render.
function inlineEquationNodeDom(
  editor: ReturnType<typeof useEditorRef>,
  id: string,
): HTMLElement | null {
  const entry = inlineEquationEntry(editor, id);
  if (entry === undefined) {
    return null;
  }

  const dom: unknown = editor.api.toDOMNode(entry[0]);
  if (!(dom instanceof HTMLElement)) {
    return null;
  }

  return dom.querySelector("[data-inline-equation]");
}

// Edits the source of one inline equation. It sits under the node and writes only on commit.
export function InlineEquationPopover({ id }: { id: string }) {
  "use no memo";

  const editor = useEditorRef();
  const readOnly = useEditorReadOnly();
  const editingId = usePluginOption(inlineEquationUiPlugin, "editingId");
  const draft = usePluginOption(inlineEquationUiPlugin, "draft");
  const mine = !readOnly && id.length > 0 && editingId === id;
  const input = useRef<HTMLInputElement>(null);
  const virtualRef = virtualAnchor(
    () => elementRect(inlineEquationNodeDom(editor, id)),
    () => anchorContext(inlineEquationNodeDom(editor, id)),
  );

  // A press outside the popover and the node commits. A press on the node keeps it open.
  useEffect(() => {
    if (!mine) {
      return;
    }

    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target;
      if (target instanceof Node) {
        if (inlineEquationNodeDom(editor, id)?.contains(target) === true) {
          return;
        }
        if (
          target instanceof Element &&
          target.closest("[data-inline-equation-popover]") !== null
        ) {
          return;
        }
      }

      commitInlineEquationEditor(editor);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [editor, id, mine]);

  if (!mine) {
    return null;
  }

  const invalid = !isStoredEquationExpression(draft.trim());

  return (
    <Popover open>
      <PopoverAnchor virtualRef={virtualRef} />
      <PopoverContent
        data-inline-equation-popover=""
        side="bottom"
        align="start"
        sideOffset={4}
        collisionPadding={8}
        hideWhenDetached
        className="w-auto p-2"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          input.current?.focus();
          input.current?.select();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
        }}
        onKeyDown={(event) => {
          // The editor must not see keys typed here. Escape and Enter are handled in this popover.
          event.stopPropagation();
          if (event.key === "Escape") {
            event.preventDefault();
            cancelInlineEquationEditor(editor);
            return;
          }
          if (event.key === "Enter" && !event.nativeEvent.isComposing) {
            event.preventDefault();
            commitInlineEquationEditor(editor);
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
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <Input
              ref={input}
              aria-label="Equation source"
              aria-invalid={invalid}
              className="w-64 font-mono text-sm"
              placeholder="E = mc^2"
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              value={draft}
              onChange={(event) => {
                setInlineEquationDraft(editor, event.target.value);
              }}
            />
            <EditorTextButton
              variant="default"
              label="Done"
              icon={<Check aria-hidden="true" />}
              onClick={() => {
                commitInlineEquationEditor(editor);
              }}
            />
          </div>
          {invalid ? <p className="text-destructive text-xs">Up to 4,000 characters.</p> : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
