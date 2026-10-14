import { type ReactNode } from "react";
import { RangeApi, type SlateEditor, type TRange } from "platejs";
import { Separator } from "@/components/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/tooltip";
import { type EditorShortcutId } from "../../lib/features/editor-shortcuts";
import type { selectionToolbarModel } from "../../lib/features/editor-selection-toolbar";
import { focusEditorWithoutScroll, retainScroll } from "./block-toolbar";
import { ShortcutLabel } from "./editor-shortcut";

export function keepSelection(event: { preventDefault: () => void }): void {
  event.preventDefault();
}
export function selectionDomRange(editor: SlateEditor): Range | null {
  if (!editor.selection || editor.api.isCollapsed()) {
    return null;
  }

  return editor.api.toDOMRange(editor.selection) ?? null;
}
export function returnToEditor(editor: SlateEditor, range: TRange | null): void {
  const root = editor.api.toDOMNode(editor);
  const next =
    editor.selection && !RangeApi.isCollapsed(editor.selection) ? editor.selection : range;
  retainScroll(() => {
    focusEditorWithoutScroll(
      root instanceof HTMLElement ? root : document.querySelector("[data-slate-editor]"),
    );
    if (next) {
      editor.tf.withoutSaving(() => {
        editor.tf.select(next);
      });
    }
  });
}
function tip(label: string, reason?: string, disabled?: boolean): string {
  if (disabled && reason) {
    return reason;
  }

  return label;
}
export function ControlTip({
  label,
  shortcut,
  reason,
  disabled,
  children,
}: {
  label: string;
  shortcut?: EditorShortcutId;
  reason?: string;
  disabled?: boolean;
  children: ReactNode;
}) {
  const showsShortcut = shortcut !== undefined && !(disabled && reason);
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent>
        {showsShortcut ? (
          <ShortcutLabel label={label} shortcut={shortcut} />
        ) : (
          tip(label, reason, disabled)
        )}
      </TooltipContent>
    </Tooltip>
  );
}
export function ToolbarRoot({
  collisionBoundary,
  children,
}: {
  collisionBoundary?: string;
  children: ReactNode;
}) {
  return (
    <div
      role="toolbar"
      aria-label="Text formatting"
      data-selection-toolbar=""
      data-collision-boundary={collisionBoundary}
      className="flex items-center gap-1"
    >
      {children}
    </div>
  );
}
export function ToolbarSeparator() {
  return (
    <Separator
      orientation="vertical"
      data-toolbar-separator=""
      className="h-5 data-vertical:self-center"
    />
  );
}
export function keepNested(event: {
  target: EventTarget | null;
  preventDefault: () => void;
}): void {
  const target = event.target;
  if (
    target instanceof Element &&
    target.closest("[data-selection-toolbar], [data-selection-toolbar-portal]") !== null
  ) {
    event.preventDefault();
  }
}
export function firstControlId(
  hasTurn: boolean,
  model: ReturnType<typeof selectionToolbarModel>,
): string {
  if (hasTurn) {
    return "turn-into";
  }
  const mark = model.marks.find((item) => !item.disabled);
  return mark?.id ?? "link";
}
export function tabOf(id: string, disabled: boolean, firstEnabled: string): number {
  if (disabled) {
    return -1;
  }

  return id === firstEnabled ? 0 : -1;
}
