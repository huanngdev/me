import { SlateElement, type SlateElementProps } from "platejs/static";

import { HR_RULE_CLASS_NAME } from "../elements/hr-classes";

export function HrStatic(props: SlateElementProps) {
  return (
    <SlateElement {...props} className="py-2">
      <hr
        contentEditable={false}
        className={HR_RULE_CLASS_NAME}
        data-block-handle-anchor="center"
      />
      {props.children}
    </SlateElement>
  );
}
