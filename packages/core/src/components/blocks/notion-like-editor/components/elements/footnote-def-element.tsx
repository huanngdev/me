import {
  PlateElement,
  useEditorRef,
  useEditorSelector,
  type PlateElementProps,
} from "platejs/react";

import { footnoteNumber } from "../../lib/features/editor-footnote";

// Minimal markup only. The number is derived, so it is shown but never stored.
export function FootnoteDefElement(props: PlateElementProps) {
  const editor = useEditorRef();
  const footnoteId = typeof props.element.footnoteId === "string" ? props.element.footnoteId : "";
  const number = useEditorSelector(() => footnoteNumber(editor, footnoteId), [editor, footnoteId]);

  // PlateElement drops unknown props, so the markers go through the root's attributes.
  const attributes = {
    ...props.attributes,
    "data-footnote-def": "",
    "data-footnote-id": footnoteId,
    ...(number === undefined ? { "data-footnote-unreferenced": "" } : {}),
  };

  return (
    <PlateElement {...props} attributes={attributes}>
      {number === undefined ? null : <span contentEditable={false}>{number}.</span>}
      {props.children}
    </PlateElement>
  );
}
