import {
  PlateElement,
  useEditorRef,
  useEditorSelector,
  type PlateElementProps,
} from "platejs/react";

import { footnoteIndex, footnoteNumber } from "../../lib/features/editor-footnote";

// Minimal markup only. Styling and interaction come with the footnote UI.
export function FootnoteRefElement(props: PlateElementProps) {
  const editor = useEditorRef();
  const footnoteId = typeof props.element.footnoteId === "string" ? props.element.footnoteId : "";
  const number = useEditorSelector(() => footnoteNumber(editor, footnoteId), [editor, footnoteId]);
  const defined = useEditorSelector(
    () => footnoteIndex(editor).definitions.has(footnoteId),
    [editor, footnoteId],
  );

  return (
    <PlateElement {...props} as="span">
      <sup
        contentEditable={false}
        data-footnote-ref=""
        data-footnote-id={footnoteId}
        data-footnote-missing={defined ? undefined : ""}
      >
        {defined && number !== undefined ? number : "?"}
      </sup>
      {props.children}
    </PlateElement>
  );
}
