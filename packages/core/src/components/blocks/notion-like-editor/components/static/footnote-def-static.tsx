import { SlateElement, type SlateElementProps } from "platejs/static";

import { cn } from "@/lib/utils";

import { footnoteIndex, startsFootnoteRun } from "../../lib/features/editor-footnote-index";
import {
  FOOTNOTE_DEF_CLASS,
  FOOTNOTE_DEF_RUN_CLASS,
  FOOTNOTE_NUMBER_CLASS,
  FOOTNOTE_NUMBER_LINK_CLASS,
  FOOTNOTE_TEXT_CLASS,
} from "../elements/footnote-classes";

// Static markup only. The back link appears only when some reference points here.
export function FootnoteDefStatic(props: SlateElementProps) {
  const footnoteId = typeof props.element.footnoteId === "string" ? props.element.footnoteId : "";
  const number = footnoteIndex(props.editor).numbers.get(footnoteId);
  const referenced = number !== undefined;
  const blockId = typeof props.element.id === "string" ? props.element.id : "";
  const startsRun = startsFootnoteRun(props.editor.children, blockId);

  // SlateElement only renders attributes, so the anchor id goes through them.
  const attributes = {
    ...props.attributes,
    id: `fn-${footnoteId}`,
    "data-footnote-def": "",
    "data-footnote-id": footnoteId,
    ...(referenced ? {} : { "data-footnote-unreferenced": "" }),
  };

  return (
    <SlateElement
      {...props}
      attributes={attributes}
      className={cn(FOOTNOTE_DEF_CLASS, startsRun && FOOTNOTE_DEF_RUN_CLASS)}
    >
      {referenced ? (
        <span
          data-footnote-number=""
          className={cn(FOOTNOTE_NUMBER_CLASS, FOOTNOTE_NUMBER_LINK_CLASS)}
        >
          {number}.
        </span>
      ) : (
        <span data-footnote-number="" title="Not referenced" className={FOOTNOTE_NUMBER_CLASS}>
          –
        </span>
      )}
      <div className={FOOTNOTE_TEXT_CLASS}>{props.children}</div>
      {referenced ? (
        <a href={`#fnref-${footnoteId}-1`} aria-label="Back to reference">
          ↩
        </a>
      ) : null}
    </SlateElement>
  );
}
