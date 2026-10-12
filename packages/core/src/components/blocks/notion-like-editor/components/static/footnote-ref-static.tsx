import { SlateElement, type SlateElementProps } from "platejs/static";

import { footnoteIndex, footnoteReferenceOrdinal } from "../../lib/features/editor-footnote-index";

// Static markup only. The number and the ordinal come from the same document the element sits in.
export function FootnoteRefStatic(props: SlateElementProps) {
  const footnoteId = typeof props.element.footnoteId === "string" ? props.element.footnoteId : "";
  const index = footnoteIndex(props.editor);
  const number = index.numbers.get(footnoteId);

  return (
    <SlateElement {...props} as="span">
      {index.definitions.has(footnoteId) && number !== undefined ? (
        <sup
          id={`fnref-${footnoteId}-${footnoteReferenceOrdinal(props.editor.children, footnoteId, props.element.id)}`}
        >
          <a href={`#fn-${footnoteId}`}>{number}</a>
        </sup>
      ) : (
        <sup>?</sup>
      )}
      {props.children}
    </SlateElement>
  );
}
