import type { RefObject } from "react";
import type { SlateEditor } from "platejs";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/command";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/popover";
import { cn } from "@/lib/utils";

import {
  BLOCK_PICKER_GROUPS,
  blockPickerItems,
  type BlockPickerItem,
  type BlockPickerMode,
} from "../../lib/features/editor-block-picker";
import { MENU_ITEM_ACTIVE } from "../../lib/features/editor-menu-active";

export type PickerAnchor = { getBoundingClientRect: () => DOMRect };

type BlockPickerProps = {
  open: boolean;
  mode: BlockPickerMode;
  editor: SlateEditor;
  path: number[];
  anchorRef: RefObject<PickerAnchor | null>;
  onOpenChange: (open: boolean) => void;
  onChoose: (item: BlockPickerItem) => void;
  restoreFocus?: () => void;
};

// One picker for both "Add" and "Turn into". Built from Popover + Command; the
// search field is CommandInput, which already composes InputGroup + Search icon.
export function BlockPicker({
  open,
  mode,
  editor,
  path,
  anchorRef,
  onOpenChange,
  onChoose,
  restoreFocus,
}: BlockPickerProps) {
  const items = blockPickerItems(editor, path, mode);
  const groups = BLOCK_PICKER_GROUPS.filter((group) => items.some((item) => item.group === group));

  return (
    <Popover open={open} onOpenChange={onOpenChange} modal={false}>
      <PopoverAnchor virtualRef={anchorRef} />
      <PopoverContent
        data-block-picker=""
        data-block-picker-mode={mode}
        align="start"
        side="bottom"
        sideOffset={4}
        collisionPadding={8}
        className="w-72 p-1"
        onOpenAutoFocus={(event) => {
          // Focus the search field, not the popover frame.
          event.preventDefault();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          restoreFocus?.();
        }}
      >
        <Command shouldFilter loop>
          <CommandInput
            placeholder="Search blocks"
            autoFocus
            data-block-picker-search=""
            aria-label="Search blocks"
          />
          <CommandList>
            <CommandEmpty>No blocks found</CommandEmpty>
            {groups.map((group) => (
              <CommandGroup key={group} heading={group}>
                {items
                  .filter((item) => item.group === group)
                  .map((item) => {
                    const Icon = item.icon;
                    return (
                      <CommandItem
                        key={item.id}
                        value={item.id}
                        keywords={[item.label, ...item.keywords]}
                        disabled={item.disabled}
                        data-block-picker-item={item.id}
                        data-checked={item.checked ? "true" : undefined}
                        className={cn(item.checked && MENU_ITEM_ACTIVE)}
                        onSelect={() => {
                          if (!item.disabled) {
                            onChoose(item);
                          }
                        }}
                      >
                        <Icon aria-hidden="true" />
                        <span className="flex min-w-0 flex-col items-start">
                          <span>{item.label}</span>
                          {item.reason === undefined ? null : (
                            <span className="text-muted-foreground text-xs whitespace-normal">
                              {item.reason}
                            </span>
                          )}
                        </span>
                      </CommandItem>
                    );
                  })}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
