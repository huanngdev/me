import type { MouseEvent } from "react";
import {
  PlateElement,
  useEditorRef,
  useEditorSelector,
  useFocused,
  useReadOnly,
  useSelected,
  type PlateElementProps,
} from "platejs/react";

import { footnoteIndex, footnoteNumber } from "../../lib/features/editor-footnote";
import {
  jumpToFootnoteDefinition,
  selectMissingFootnoteReference,
} from "../../lib/plugins/editor-footnote-ui";
import { blockSelectionActive } from "../../lib/plugins/editor-block-selection";
import { footnoteRefClassName } from "./footnote-classes";

export function FootnoteRefElement(props: PlateElementProps) {
  const editor = useEditorRef();
  const readOnly = useReadOnly();
  const selected = useSelected();
  const focused = useFocused();
  const footnoteId = typeof props.element.footnoteId === "string" ? props.element.footnoteId : "";
  const number = useEditorSelector(() => footnoteNumber(editor, footnoteId), [editor, footnoteId]);
  const defined = useEditorSelector(
    () => footnoteIndex(editor).definitions.has(footnoteId),
    [editor, footnoteId],
  );
  const shown = defined && number !== undefined;

  // Plain left clicks only. A modifier or a block selection leaves the click to the browser.
  function onClick(event: MouseEvent<HTMLElement>): void {
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      blockSelectionActive(editor)
    ) {
      return;
    }

    // Editable would place the caret at the clicked node after this handler, so stop it here.
    event.stopPropagation();
    event.preventDefault();

    if (!shown) {
      const path = editor.api.findPath(props.element);
      if (path !== undefined) {
        selectMissingFootnoteReference(editor, path);
      }
      return;
    }

    jumpToFootnoteDefinition(editor, footnoteId);
  }

  return (
    <PlateElement {...props} as="span" className="inline align-baseline">
      <sup
        contentEditable={false}
        role="link"
        aria-label={shown ? `Footnote ${number}` : "Footnote not found"}
        data-footnote-ref=""
        data-footnote-id={footnoteId}
        data-footnote-missing={shown ? undefined : ""}
        className={footnoteRefClassName(selected && focused && !readOnly)}
        onClick={onClick}
      >
        {shown ? number : "?"}
      </sup>
      {props.children}
    </PlateElement>
  );
}
