import { SlateElement, type SlateElementProps } from "platejs/static";

import { footnoteIndex } from "../../lib/features/editor-footnote-index";

// Static markup only. The back link appears only when some reference points here.
export function FootnoteDefStatic(props: SlateElementProps) {
  const footnoteId = typeof props.element.footnoteId === "string" ? props.element.footnoteId : "";
  const number = footnoteIndex(props.editor).numbers.get(footnoteId);

  // SlateElement only renders attributes, so the anchor id goes through them.
  const attributes = {
    ...props.attributes,
    id: `fn-${footnoteId}`,
    "data-footnote-def": "",
    "data-footnote-id": footnoteId,
  };

  return (
    <SlateElement {...props} attributes={attributes}>
      {number === undefined ? null : <span>{number}. </span>}
      {props.children}
      {number === undefined ? null : (
        <a href={`#fnref-${footnoteId}-1`} aria-label="Back to reference">
          ↩
        </a>
      )}
    </SlateElement>
  );
}
