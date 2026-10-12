import {
  PlateElement,
  useEditorRef,
  useEditorSelector,
  type PlateElementProps,
} from "platejs/react";

import { cn } from "@/lib/utils";

import { footnoteNumber, startsFootnoteRunInEditor } from "../../lib/features/editor-footnote";
import { jumpToFootnoteReference } from "../../lib/plugins/editor-footnote-ui";
import {
  FOOTNOTE_DEF_CLASS,
  FOOTNOTE_DEF_RUN_CLASS,
  FOOTNOTE_NUMBER_CLASS,
  FOOTNOTE_NUMBER_LINK_CLASS,
  FOOTNOTE_TEXT_CLASS,
} from "./footnote-classes";

export function FootnoteDefElement(props: PlateElementProps) {
  const editor = useEditorRef();
  const footnoteId = typeof props.element.footnoteId === "string" ? props.element.footnoteId : "";
  const blockId = typeof props.element.id === "string" ? props.element.id : "";
  const number = useEditorSelector(() => footnoteNumber(editor, footnoteId), [editor, footnoteId]);
  const startsRun = useEditorSelector(
    () => startsFootnoteRunInEditor(editor, blockId),
    [editor, blockId],
  );
  const referenced = number !== undefined;

  // The markers and the anchor go on the root through its attributes, as PlateElement drops other props.
  const attributes = {
    ...props.attributes,
    "data-footnote-def": "",
    "data-footnote-id": footnoteId,
    ...(referenced ? {} : { "data-footnote-unreferenced": "" }),
  };

  return (
    <PlateElement
      {...props}
      attributes={attributes}
      className={cn(FOOTNOTE_DEF_CLASS, startsRun && FOOTNOTE_DEF_RUN_CLASS)}
    >
      {referenced ? (
        <span
          contentEditable={false}
          data-footnote-number=""
          className={cn(FOOTNOTE_NUMBER_CLASS, FOOTNOTE_NUMBER_LINK_CLASS)}
          onClick={(event) => {
            event.stopPropagation();
            event.preventDefault();
            jumpToFootnoteReference(editor, footnoteId);
          }}
        >
          {number}.
        </span>
      ) : (
        <span
          contentEditable={false}
          data-footnote-number=""
          title="Not referenced"
          className={FOOTNOTE_NUMBER_CLASS}
        >
          –
        </span>
      )}
      <div className={FOOTNOTE_TEXT_CLASS}>{props.children}</div>
    </PlateElement>
  );
}
