import { type ReactNode } from "react";
import { AlignCenter, AlignJustify, AlignLeft, AlignRight } from "lucide-react";
import { Button } from "@/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/dropdown-menu";
import { TEXT_ALIGNS, type TextAlign } from "../../lib/document/editor-document-schema";
import { MENU_ITEM_ACTIVE_CHECKED } from "../../lib/features/editor-menu-active";
import type { selectionToolbarModel } from "../../lib/features/editor-selection-toolbar";
import { keepSelection, ControlTip, tabOf } from "./selection-toolbar-parts";

const ALIGN_LABEL: Record<TextAlign, string> = {
  left: "Left",
  center: "Center",
  right: "Right",
  justify: "Justify",
};
export const ALIGN_ICON = {
  left: AlignLeft,
  center: AlignCenter,
  right: AlignRight,
  justify: AlignJustify,
} as const;
export function AlignMenu({
  model,
  icon,
  firstEnabled,
  onOpenChange,
  onAlign,
  onRestore,
}: {
  model: ReturnType<typeof selectionToolbarModel>;
  icon: ReactNode;
  firstEnabled: string;
  onOpenChange: (open: boolean) => void;
  onAlign: (value: TextAlign | null) => void;
  onRestore: () => void;
}) {
  const alignValue = model.align === "mixed" ? "" : (model.align ?? "left");

  return (
    <DropdownMenu modal={false} onOpenChange={onOpenChange}>
      <ControlTip label="Align" reason={model.alignReason} disabled={model.alignDisabled}>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label="Align"
            disabled={model.alignDisabled}
            data-toolbar-control="align"
            data-align-current={alignIconName(model.align)}
            tabIndex={tabOf("align", model.alignDisabled, firstEnabled)}
            className="disabled:pointer-events-auto"
            onMouseDown={keepSelection}
          >
            {icon}
          </Button>
        </DropdownMenuTrigger>
      </ControlTip>
      <DropdownMenuContent
        data-selection-toolbar-portal=""
        data-selection-align=""
        collisionPadding={8}
        hideWhenDetached
        onCloseAutoFocus={(event) => {
          keepSelection(event);
          onRestore();
        }}
      >
        <DropdownMenuRadioGroup value={alignValue}>
          {TEXT_ALIGNS.map((align) => (
            <DropdownMenuRadioItem
              key={align}
              value={align}
              className={MENU_ITEM_ACTIVE_CHECKED}
              data-align-choice={align}
              onSelect={() => {
                onAlign(align);
              }}
            >
              {alignIcon(align)}
              {ALIGN_LABEL[align]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
function alignIcon(align: TextAlign): ReactNode {
  const Icon = ALIGN_ICON[align];
  return <Icon aria-hidden="true" />;
}
function alignIconName(align: TextAlign | "mixed" | null): TextAlign {
  if (align === "mixed" || align === null) {
    return "left";
  }

  return align;
}
