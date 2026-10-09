import {
  PlateElement,
  useFocused,
  useReadOnly,
  useSelected,
  type PlateElementProps,
} from "platejs/react";

import { cn } from "@/lib/utils";

// AGENTS.md line 29 keeps the accent for active states. The selected ring uses
// the focus ring token, which is the violet accent under the site palette.
// Plate wraps an <hr> the same way (react/index.js FastIntrinsicElement): a div,
// <hr contentEditable={false}>, then the Slate children. There is no click handler.
export const HR_RULE_CLASS_NAME = "my-0 border-0 border-t border-border";
export const HR_SELECTED_CLASS_NAME = "ring-2 ring-ring";

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
      <hr contentEditable={false} className={HR_RULE_CLASS_NAME} />
      {props.children}
    </PlateElement>
  );
}
