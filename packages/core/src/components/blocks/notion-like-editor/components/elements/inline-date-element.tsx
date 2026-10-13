import { useEffect } from "react";
import {
  PlateElement,
  useEditorRef,
  useFocused,
  usePluginOption,
  useReadOnly,
  useSelected,
  type PlateElementProps,
} from "platejs/react";

import { cn } from "@/lib/utils";

import { formatStoredDate, isStoredDate } from "../../lib/features/editor-date-value";
import {
  inlineDateUiPlugin,
  openInlineDateEditor,
  resetInlineDateEditor,
} from "../../lib/plugins/editor-inline-date-ui";
import { InlineDatePopover } from "../ui/inline-date-popover";
import { INLINE_DATE_CHIP_CLASS, INLINE_DATE_CLASS } from "./inline-date-classes";

export function InlineDateElement(props: PlateElementProps) {
  const editor = useEditorRef();
  const readOnly = useReadOnly();
  const selected = useSelected();
  const focused = useFocused();
  const id = typeof props.element.id === "string" ? props.element.id : "";
  const editingId = usePluginOption(inlineDateUiPlugin, "editingId");
  const stored = props.element.date;
  const valid = isStoredDate(stored);

  // A switch to read-only drops the open popover without writing. Removal is handled in the
  // plugin's onChange wrapper. This is not an unmount cleanup, so StrictMode cannot reset it.
  useEffect(() => {
    if (readOnly && editingId === id) {
      resetInlineDateEditor(editor);
    }
  }, [editingId, editor, id, readOnly]);

  return (
    <PlateElement {...props} as="span" className={INLINE_DATE_CLASS}>
      <span
        contentEditable={false}
        data-inline-date={valid ? stored : ""}
        className={cn(
          INLINE_DATE_CHIP_CLASS,
          selected && focused && !readOnly && "ring-ring ring-1",
        )}
        onClick={
          readOnly
            ? undefined
            : () => {
                openInlineDateEditor(editor, id);
              }
        }
      >
        {valid ? (
          <time dateTime={stored}>{formatStoredDate(stored)}</time>
        ) : (
          <span data-inline-date-invalid="" className="text-destructive">
            Invalid date
          </span>
        )}
      </span>
      {readOnly ? null : <InlineDatePopover id={id} />}
      {props.children}
    </PlateElement>
  );
}
