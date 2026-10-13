import { SlateElement, type SlateElementProps } from "platejs/static";

import { LIST_SIBLING_GAP_CLASS } from "../elements/block-list-metrics";
import { BLOCKQUOTE_CLASS_NAME } from "../elements/blockquote-classes";

export function BlockquoteStatic(props: SlateElementProps) {
  return (
    <SlateElement
      {...props}
      as="blockquote"
      className={`${BLOCKQUOTE_CLASS_NAME} ${LIST_SIBLING_GAP_CLASS}`}
    />
  );
}
