import { SlateElement, type SlateElementProps } from "platejs/static";

import { formatStoredDate, isStoredDate } from "../../lib/features/editor-date-value";
import { INLINE_DATE_CHIP_CLASS, INLINE_DATE_CLASS } from "../elements/inline-date-classes";

export function InlineDateStatic(props: SlateElementProps) {
  const stored = props.element.date;
  const valid = isStoredDate(stored);

  return (
    <SlateElement {...props} as="span" className={INLINE_DATE_CLASS}>
      <span
        contentEditable={false}
        data-inline-date={valid ? stored : ""}
        className={INLINE_DATE_CHIP_CLASS}
      >
        {valid ? (
          <time dateTime={stored}>{formatStoredDate(stored)}</time>
        ) : (
          <span data-inline-date-invalid="" className="text-destructive">
            Invalid date
          </span>
        )}
      </span>
      {props.children}
    </SlateElement>
  );
}
