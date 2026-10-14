import { type ReactNode } from "react";
import {
  DropdownMenuCheckboxItem,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/dropdown-menu";
import { shortcutText } from "../../lib/features/editor-shortcuts";
import { MENU_ITEM_ACTIVE_CHECKED } from "../../lib/features/editor-menu-active";
import { type SelectionToolbarMarkState } from "../../lib/features/editor-selection-toolbar";
import { useShortcutPlatform } from "./editor-shortcut";
import { MenuScrollArea } from "./editor-scroll";

export function CheckItem({
  mark,
  icon,
  onToggle,
}: {
  mark: SelectionToolbarMarkState;
  icon: ReactNode;
  onToggle: () => void;
}) {
  const platform = useShortcutPlatform();
  return (
    <DropdownMenuCheckboxItem
      checked={mark.mixed ? "indeterminate" : mark.pressed}
      disabled={mark.disabled}
      data-state-mixed={mark.mixed ? "" : undefined}
      data-more-choice={mark.id}
      onSelect={() => {
        onToggle();
      }}
    >
      {icon}
      <span>{mark.label}</span>
      {platform !== null && mark.shortcut ? (
        <DropdownMenuShortcut>{shortcutText(mark.shortcut, platform)}</DropdownMenuShortcut>
      ) : null}
    </DropdownMenuCheckboxItem>
  );
}
export function ChoiceMenu({
  label,
  icon,
  value,
  children,
}: {
  label: string;
  icon: ReactNode;
  value: string;
  children: ReactNode;
}) {
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        {icon}
        {label}
      </DropdownMenuSubTrigger>
      <DropdownMenuPortal>
        <DropdownMenuSubContent
          data-selection-toolbar-portal=""
          collisionPadding={8}
          hideWhenDetached
          className="max-h-[var(--radix-dropdown-menu-content-available-height)] overflow-hidden"
        >
          <MenuScrollArea>
            <DropdownMenuRadioGroup value={value}>{children}</DropdownMenuRadioGroup>
          </MenuScrollArea>
        </DropdownMenuSubContent>
      </DropdownMenuPortal>
    </DropdownMenuSub>
  );
}
export function DefaultRadio({ onSelect }: { onSelect: () => void }) {
  return (
    <DropdownMenuRadioItem
      value="default"
      className={MENU_ITEM_ACTIVE_CHECKED}
      data-more-choice="default"
      onSelect={onSelect}
    >
      Default
    </DropdownMenuRadioItem>
  );
}
export function choiceValue(value: string | number | null | "mixed"): string {
  if (value === "mixed") {
    return "";
  }
  if (value === null) {
    return "default";
  }

  return String(value);
}
