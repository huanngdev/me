import { useCallback, useLayoutEffect, useRef, useSyncExternalStore, type RefObject } from "react";
import { createPortal } from "react-dom";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragCancelEvent,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { GripVertical, Plus } from "lucide-react";
import { useEditorReadOnly, useEditorRef } from "platejs/react";

import { Button } from "@/components/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/tooltip";
import { cn } from "@/lib/utils";

import { useBlockHandle } from "../../hooks/use-block-handle";
import {
  blockPickerAddItems,
  insertPickedBlock,
  type BlockPickerItem,
} from "../../lib/features/editor-block-picker";
import { BLOCK_MENU_GRIP_LABEL } from "../../lib/features/editor-block-menu";
import type { BlockHandleHit } from "../../lib/features/editor-block-handle";
import {
  BlockDropIndicator,
  DRAG_ACTIVATION_DISTANCE_PX,
  useBlockDrag,
  type BlockDragHandlers,
} from "./block-drag";
import { BlockMenu } from "./block-menu";
import { BlockPickerGroups } from "./block-picker";
import { MenuScrollArea } from "./editor-scroll";
import { retainScroll } from "./block-toolbar";

const ADD_LABEL = "Add block below";

type BlockHandleProps = {
  onInsertedBelow?: (blockId: string) => void;
};

function keepEditorSelection(event: { preventDefault: () => void }): void {
  event.preventDefault();
}

// renderToString throws on a portal. The menu stays mounted on the client even
// when the grip is not painted, so a shortcut can open it.
function useClientPortal(): boolean {
  return useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );
}

export function BlockHandle({ onInsertedBelow }: BlockHandleProps) {
  const client = useClientPortal();
  // A read-only editor paints no handle, so it should not mount the drag layer
  // (and its body portal) either.
  const readOnly = useEditorReadOnly();
  const apiRef = useRef<BlockDragHandlers | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: DRAG_ACTIVATION_DISTANCE_PX },
    }),
  );
  const onDragStart = useCallback((event: DragStartEvent) => {
    apiRef.current?.onDragStart(event);
  }, []);
  const onDragMove = useCallback((event: DragMoveEvent) => {
    apiRef.current?.onDragMove(event);
  }, []);
  const onDragEnd = useCallback((event: DragEndEvent) => {
    apiRef.current?.onDragEnd(event);
  }, []);
  const onDragCancel = useCallback((event: DragCancelEvent) => {
    void event;
    apiRef.current?.onDragCancel();
  }, []);

  if (!client || readOnly) {
    return null;
  }

  return createPortal(
    <DndContext
      sensors={sensors}
      autoScroll
      onDragStart={onDragStart}
      onDragMove={onDragMove}
      onDragEnd={onDragEnd}
      onDragCancel={onDragCancel}
    >
      <BlockHandleContent onInsertedBelow={onInsertedBelow} apiRef={apiRef} />
    </DndContext>,
    document.body,
  );
}

function BlockHandleContent({
  onInsertedBelow,
  apiRef,
}: {
  onInsertedBelow?: (blockId: string) => void;
  apiRef: RefObject<BlockDragHandlers | null>;
}) {
  const editor = useEditorRef();
  const handle = useBlockHandle({ onInsertedBelow });
  const { paint, setMeasuredSize, shown, suppressed, onHandleFocus, onHandleBlur } = handle;
  const rowRef = useRef<HTMLDivElement>(null);
  const gripRef = useRef<HTMLButtonElement>(null);
  const savedSelection = useRef(editor.selection);
  const openMenu = useRef<(target: BlockHandleHit) => void>(() => undefined);
  const closeMenu = useRef<() => void>(() => undefined);
  const bindOpener = useCallback((open: (target: BlockHandleHit) => void) => {
    openMenu.current = open;
  }, []);
  const bindCloser = useCallback((close: () => void) => {
    closeMenu.current = close;
  }, []);
  const drag = useBlockDrag({
    target: paint?.target ?? null,
    closeMenu: () => closeMenu.current(),
    clearPointer: handle.clearPointer,
    rehover: handle.rehover,
    apiRef,
  });

  useLayoutEffect(() => {
    const row = rowRef.current;
    if (!row) {
      return;
    }
    setMeasuredSize(row.offsetWidth, row.offsetHeight);
  }, [paint, setMeasuredSize]);

  const chooseAdd = useCallback(
    (item: BlockPickerItem) => {
      const path = paint?.target.path;
      if (!path) {
        return;
      }
      const insertedId = insertPickedBlock(editor, path, item);
      if (insertedId !== null) {
        onInsertedBelow?.(insertedId);
      }
    },
    [editor, onInsertedBelow, paint],
  );

  if (suppressed) {
    return null;
  }

  const addItems = paint ? blockPickerAddItems(editor, paint.target.path) : [];
  const menu = (
    <BlockMenu
      gripRef={gripRef}
      holdMenu={handle.holdMenu}
      bindOpener={bindOpener}
      bindCloser={bindCloser}
    />
  );
  // Stop at the block edge. A pixel inside the box covers a control that sits
  // on that edge, such as the toggle chevron.
  const gutterWidth = paint ? Math.max(0, paint.blockLeft - (paint.left + paint.width)) : 0;
  const gutterTop = paint ? paint.blockTop - paint.top : 0;
  const gutterHeight = paint ? Math.max(paint.height, paint.blockBottom - paint.blockTop) : 0;
  const visible = shown && !drag.dragging;

  return (
    <>
      {paint ? (
        <div
          data-block-handle=""
          data-block-handle-for={paint.target.id}
          data-visible={visible ? "true" : "false"}
          className={cn(
            "fixed z-20 transition-opacity duration-150 ease-out motion-reduce:transition-none",
            visible ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
            "[@media(hover:none)]:hidden",
          )}
          style={{ top: paint.top, left: paint.left }}
          onFocus={onHandleFocus}
          onBlur={(event) => {
            onHandleBlur(event.relatedTarget);
          }}
        >
          <div ref={rowRef} className="flex items-center gap-0">
            <DropdownMenu
              modal={false}
              onOpenChange={(open) => {
                if (open) {
                  savedSelection.current = editor.selection;
                }
              }}
            >
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label={ADD_LABEL}
                      data-block-handle-add=""
                      onMouseDown={keepEditorSelection}
                    >
                      <Plus aria-hidden="true" />
                    </Button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent data-block-handle-tooltip="">{ADD_LABEL}</TooltipContent>
              </Tooltip>
              <DropdownMenuContent
                data-block-add-menu=""
                align="start"
                side="bottom"
                sideOffset={4}
                collisionPadding={8}
                hideWhenDetached
                className="max-h-[var(--radix-dropdown-menu-content-available-height)] w-64 overflow-hidden"
                onCloseAutoFocus={(event) => {
                  event.preventDefault();
                  const selection = savedSelection.current;
                  retainScroll(() => {
                    editor.tf.withoutSaving(() => {
                      editor.tf.focus();
                      if (selection) {
                        editor.tf.deselect();
                        editor.tf.select(selection);
                      }
                    });
                  });
                }}
              >
                <MenuScrollArea>
                  <BlockPickerGroups items={addItems} onChoose={chooseAdd} />
                </MenuScrollArea>
              </DropdownMenuContent>
            </DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  ref={(node) => {
                    gripRef.current = node;
                    drag.setNodeRef(node);
                  }}
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label={BLOCK_MENU_GRIP_LABEL}
                  data-block-handle-grip=""
                  {...drag.attributes}
                  {...drag.listeners}
                  onMouseDown={keepEditorSelection}
                  onClick={() => {
                    if (drag.consumeClick()) {
                      return;
                    }
                    if (paint) {
                      openMenu.current(paint.target);
                    }
                  }}
                >
                  <GripVertical aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent data-block-handle-tooltip="">{BLOCK_MENU_GRIP_LABEL}</TooltipContent>
            </Tooltip>
          </div>
          <div
            data-block-handle-gutter=""
            aria-hidden="true"
            className="absolute"
            style={{ left: "100%", top: gutterTop, width: gutterWidth, height: gutterHeight }}
          />
        </div>
      ) : null}
      {drag.indicator ? <BlockDropIndicator line={drag.indicator} /> : null}
      {/* No drop animation: on release the preview disappears at once and the
          block is simply at its new position (no fly-back to the old slot). */}
      <DragOverlay dropAnimation={null}>{drag.overlay}</DragOverlay>
      {menu}
    </>
  );
}
