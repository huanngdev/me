import { Fragment } from "react";

import {
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
} from "@/components/dropdown-menu";
import { cn } from "@/lib/utils";

import { BLOCK_PICKER_GROUPS, type BlockPickerItem } from "../../lib/features/editor-block-picker";
import {
  itemShortcutId,
  shortcutText,
  type ShortcutPlatform,
} from "../../lib/features/editor-shortcuts";
import { MENU_ITEM_ACTIVE_CHECKED } from "../../lib/features/editor-menu-active";
import { useShortcutPlatform } from "./editor-shortcut";

function ItemLabel({ item, shortcut }: { item: BlockPickerItem; shortcut?: string }) {
  const Icon = item.icon;
  return (
    <>
      <Icon aria-hidden="true" />
      <span className="flex min-w-0 flex-col items-start">
        <span>{item.label}</span>
        {item.reason === undefined ? null : (
          <span className="text-muted-foreground text-xs whitespace-normal">{item.reason}</span>
        )}
      </span>
      {shortcut === undefined ? null : <DropdownMenuShortcut>{shortcut}</DropdownMenuShortcut>}
    </>
  );
}

function itemShortcut(
  item: BlockPickerItem,
  platform: ShortcutPlatform | null,
): string | undefined {
  const id = itemShortcutId(item.id);
  return id !== undefined && platform !== null ? shortcutText(id, platform) : undefined;
}

// One shared renderer for the grouped block list, used by both the "+" Add menu
// and the "Turn into" submenu so the two cannot drift. `radio` renders the
// conversion items as a checked radio group; otherwise they are plain actions.
export function BlockPickerGroups({
  items,
  onChoose,
  value,
  radio = false,
  shortcuts = false,
}: {
  items: readonly BlockPickerItem[];
  onChoose: (item: BlockPickerItem) => void;
  value?: string;
  radio?: boolean;
  shortcuts?: boolean;
}) {
  // Only the Turn into submenu shows hints. Its shortcuts convert the current block, as the item does.
  const devicePlatform = useShortcutPlatform();
  const platform = shortcuts ? devicePlatform : null;
  const groups = BLOCK_PICKER_GROUPS.filter((group) => items.some((item) => item.group === group));

  const rows = groups.map((group, index) => (
    <Fragment key={group}>
      {index > 0 ? <DropdownMenuSeparator /> : null}
      <DropdownMenuGroup>
        <DropdownMenuLabel>{group}</DropdownMenuLabel>
        {items
          .filter((item) => item.group === group)
          .map((item) =>
            radio ? (
              <DropdownMenuRadioItem
                key={item.id}
                value={item.id}
                disabled={item.disabled}
                data-block-picker-item={item.id}
                className={cn(item.checked && MENU_ITEM_ACTIVE_CHECKED)}
              >
                <ItemLabel item={item} shortcut={itemShortcut(item, platform)} />
              </DropdownMenuRadioItem>
            ) : (
              <DropdownMenuItem
                key={item.id}
                disabled={item.disabled}
                data-block-picker-item={item.id}
                onSelect={() => {
                  if (!item.disabled) {
                    onChoose(item);
                  }
                }}
              >
                <ItemLabel item={item} shortcut={itemShortcut(item, platform)} />
              </DropdownMenuItem>
            ),
          )}
      </DropdownMenuGroup>
    </Fragment>
  ));

  if (!radio) {
    return <>{rows}</>;
  }

  return (
    <DropdownMenuRadioGroup
      value={value ?? ""}
      onValueChange={(next) => {
        const item = items.find((candidate) => candidate.id === next);
        if (item && !item.disabled) {
          onChoose(item);
        }
      }}
    >
      {rows}
    </DropdownMenuRadioGroup>
  );
}
