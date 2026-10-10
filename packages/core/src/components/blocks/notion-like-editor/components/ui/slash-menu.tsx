import { useEffect } from "react";
import { useEditorRef, usePluginOption, useReadOnly } from "platejs/react";

import { Command, CommandGroup, CommandItem, CommandList } from "@/components/command";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/popover";

import { runEditorCommand } from "../../lib/commands/editor-commands";
import { BLOCK_PICKER_GROUPS } from "../../lib/features/editor-block-picker";
import {
  SLASH_EMPTY_LABEL,
  SLASH_MENU_LABEL,
  findSlashBlock,
  pointAtBlockOffset,
  slashShowsGroups,
  type SlashGroup,
  type SlashItem,
} from "../../lib/features/editor-slash";
import {
  chooseSlashItem,
  closeSlashMenu,
  slashMenuItems,
  slashSession,
  slashUiPlugin,
} from "../../lib/plugins/editor-slash";
import { anchorContext, rangeContextElement, rangeRect, virtualAnchor } from "./anchor-rect";
import { retainScroll } from "./block-toolbar";
import { ScrollFadeArea } from "./editor-scroll";

const SLASH_GROUPS: readonly SlashGroup[] = [...BLOCK_PICKER_GROUPS, "Inline"];

export function SlashMenu() {
  const editor = useEditorRef();
  const readOnly = useReadOnly();
  const open = usePluginOption(slashUiPlugin, "open");
  const activeIndex = usePluginOption(slashUiPlugin, "activeIndex");
  const blockId = usePluginOption(slashUiPlugin, "blockId");
  const offset = usePluginOption(slashUiPlugin, "offset");
  const queryHint = usePluginOption(slashUiPlugin, "query");
  const items = open ? slashMenuItems(editor) : [];
  const query = open ? (slashSession(editor)?.query ?? queryHint) : queryHint;
  const activeId = items[Math.min(activeIndex, Math.max(items.length - 1, 0))]?.id ?? "";
  const virtualRef = virtualAnchor(
    () => rangeRect(slashCharRange(editor, blockId, offset)),
    () => anchorContext(rangeContextElement(slashCharRange(editor, blockId, offset))),
  );

  useEffect(() => {
    if (!open || !readOnly) {
      return;
    }
    closeSlashMenu(editor);
  }, [editor, open, readOnly]);

  useEffect(() => {
    if (!open || activeId.length === 0) {
      return;
    }
    const row = document.querySelector(`[data-slash-item="${activeId}"]`);
    if (row instanceof HTMLElement) {
      row.scrollIntoView({ block: "nearest" });
    }
  }, [activeId, open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target;
      if (target instanceof Element && target.closest("[data-slash-menu]") !== null) {
        return;
      }
      closeSlashMenu(editor);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [editor, open]);

  if (!open) {
    return null;
  }

  const grouped = slashShowsGroups(query);

  return (
    <Popover open modal={false}>
      <PopoverAnchor virtualRef={virtualRef} />
      <PopoverContent
        data-slash-menu=""
        side="bottom"
        align="start"
        sideOffset={4}
        collisionPadding={8}
        hideWhenDetached
        className="w-72 gap-0 p-0"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
        }}
        onMouseDown={(event) => {
          event.preventDefault();
        }}
      >
        <Command label={SLASH_MENU_LABEL} shouldFilter={false} value={activeId} loop={false}>
          <ScrollFadeArea orientation="vertical" className="max-h-72">
            <CommandList className="max-h-none overflow-visible p-0" label={SLASH_MENU_LABEL}>
              {items.length === 0 ? (
                <div data-slash-empty="" className="text-muted-foreground px-2 py-3 text-sm">
                  {SLASH_EMPTY_LABEL}
                </div>
              ) : grouped ? (
                groupedRows(items, activeId, editor)
              ) : (
                <CommandGroup>
                  {items.map((item, index) => (
                    <SlashRow
                      key={item.id}
                      item={item}
                      selected={item.id === activeId}
                      onHighlight={() => {
                        editor.setOption(slashUiPlugin, "activeIndex", index);
                      }}
                      onChoose={() => {
                        choose(editor, item.id);
                      }}
                    />
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </ScrollFadeArea>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function groupedRows(
  items: readonly SlashItem[],
  activeId: string,
  editor: ReturnType<typeof useEditorRef>,
) {
  return SLASH_GROUPS.filter((group) => items.some((item) => item.group === group)).map((group) => (
    <CommandGroup key={group} heading={group}>
      {items
        .filter((item) => item.group === group)
        .map((item) => (
          <SlashRow
            key={item.id}
            item={item}
            selected={item.id === activeId}
            onHighlight={() => {
              editor.setOption(
                slashUiPlugin,
                "activeIndex",
                items.findIndex((entry) => entry.id === item.id),
              );
            }}
            onChoose={() => {
              choose(editor, item.id);
            }}
          />
        ))}
    </CommandGroup>
  ));
}

function SlashRow({
  item,
  selected,
  onHighlight,
  onChoose,
}: {
  item: SlashItem;
  selected: boolean;
  onHighlight: () => void;
  onChoose: () => void;
}) {
  const Icon = item.icon;
  return (
    <CommandItem
      value={item.id}
      data-slash-item={item.id}
      role="option"
      aria-selected={selected}
      className="items-start"
      onMouseDown={(event) => {
        event.preventDefault();
      }}
      onMouseEnter={onHighlight}
      onSelect={onChoose}
    >
      <Icon aria-hidden="true" />
      <span className="flex min-w-0 flex-col">
        <span>{item.label}</span>
        <span className="text-muted-foreground text-xs">{item.description}</span>
      </span>
    </CommandItem>
  );
}

function choose(editor: ReturnType<typeof useEditorRef>, id: string): void {
  retainScroll(() => {
    runEditorCommand(editor, chooseSlashItem, id);
    editor.tf.focus();
  });
}

function slashCharRange(
  editor: ReturnType<typeof useEditorRef>,
  blockId: string,
  offset: number,
): Range | null {
  const block = findSlashBlock(editor, blockId);
  if (block === null) {
    return null;
  }
  const start = pointAtBlockOffset(editor, block[1], offset);
  const end = pointAtBlockOffset(editor, block[1], offset + 1);
  if (start === null || end === null) {
    return null;
  }
  try {
    return editor.api.toDOMRange({ anchor: start, focus: end }) ?? null;
  } catch {
    return null;
  }
}
