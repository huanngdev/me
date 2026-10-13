import {
  PlateElement,
  useFocused,
  useReadOnly,
  useSelected,
  type PlateElementProps,
} from "platejs/react";

import { cn } from "@/lib/utils";

import { BLOCK_SELECTED_CLASS, HR_RULE_CLASS_NAME, HR_SELECTED_CLASS_NAME } from "./hr-classes";

export { BLOCK_SELECTED_CLASS, HR_RULE_CLASS_NAME, HR_SELECTED_CLASS_NAME };

export function hrElementClassName(
  selected: boolean,
  focused: boolean,
  readOnly: boolean,
): string | undefined {
  if (!selected || !focused || readOnly) {
    return undefined;
  }

  return HR_SELECTED_CLASS_NAME;
}

export function HrElement(props: PlateElementProps) {
  const className = hrElementClassName(useSelected(), useFocused(), useReadOnly());

  return (
    <PlateElement {...props} className={cn("py-2", className)}>
      <hr
        contentEditable={false}
        className={HR_RULE_CLASS_NAME}
        data-block-handle-anchor="center"
      />
      {props.children}
    </PlateElement>
  );
}
