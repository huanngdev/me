import { SlateElement, type SlateElementProps } from "platejs/static";

import { footnoteIndex, footnoteReferenceOrdinal } from "../../lib/features/editor-footnote-index";
import { footnoteRefClassName } from "../elements/footnote-classes";

// Static markup only. The number and the ordinal come from the same document the element sits in.
export function FootnoteRefStatic(props: SlateElementProps) {
  const footnoteId = typeof props.element.footnoteId === "string" ? props.element.footnoteId : "";
  const index = footnoteIndex(props.editor);
  const number = index.numbers.get(footnoteId);
  const className = footnoteRefClassName(false);

  return (
    <SlateElement {...props} as="span" className="inline align-baseline">
      {index.definitions.has(footnoteId) && number !== undefined ? (
        <sup
          data-footnote-ref=""
          data-footnote-id={footnoteId}
          id={`fnref-${footnoteId}-${footnoteReferenceOrdinal(props.editor.children, footnoteId, props.element.id)}`}
          aria-label={`Footnote ${number}`}
          className={className}
        >
          <a href={`#fn-${footnoteId}`}>{number}</a>
        </sup>
      ) : (
        <sup
          data-footnote-ref=""
          data-footnote-id={footnoteId}
          data-footnote-missing=""
          aria-label="Footnote not found"
          className={className}
        >
          ?
        </sup>
      )}
      {props.children}
    </SlateElement>
  );
}
