import { useCallback, useLayoutEffect, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { GripVertical, Plus } from "lucide-react";

import { Button } from "@/components/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/tooltip";
import { cn } from "@/lib/utils";

import { useBlockHandle } from "../../hooks/use-block-handle";
import { BLOCK_MENU_GRIP_LABEL } from "../../lib/features/editor-block-menu";
import type { BlockHandleHit } from "../../lib/features/editor-block-handle";
import { BlockMenu } from "./block-menu";

const ADD_LABEL = "Click to add below";

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
  const handle = useBlockHandle({ onInsertedBelow });
  const { paint, setMeasuredSize, shown, suppressed, addBelow, onHandleFocus, onHandleBlur } =
    handle;
  const rowRef = useRef<HTMLDivElement>(null);
  const gripRef = useRef<HTMLButtonElement>(null);
  const openMenu = useRef<(target: BlockHandleHit) => void>(() => undefined);
  const bindOpener = useCallback((open: (target: BlockHandleHit) => void) => {
    openMenu.current = open;
  }, []);
  const client = useClientPortal();

  useLayoutEffect(() => {
    const row = rowRef.current;
    if (!row) {
      return;
    }
    setMeasuredSize(row.offsetWidth, row.offsetHeight);
  }, [paint, setMeasuredSize]);

  if (suppressed || !client) {
    return null;
  }

  const menu = <BlockMenu gripRef={gripRef} holdMenu={handle.holdMenu} bindOpener={bindOpener} />;
  // Stop at the block edge. A pixel inside the box covers a control that sits
  // on that edge, such as the toggle chevron.
  const gutterWidth = paint ? Math.max(0, paint.blockLeft - (paint.left + paint.width)) : 0;
  const gutterTop = paint ? paint.blockTop - paint.top : 0;
  const gutterHeight = paint ? Math.max(paint.height, paint.blockBottom - paint.blockTop) : 0;

  const handleNode = paint ? (
    <div
      data-block-handle=""
      data-block-handle-for={paint.target.id}
      data-visible={shown ? "true" : "false"}
      className={cn(
        "fixed z-20 transition-opacity duration-150 ease-out motion-reduce:transition-none",
        shown ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
        "[@media(hover:none)]:hidden",
      )}
      style={{ top: paint.top, left: paint.left }}
      onFocus={onHandleFocus}
      onBlur={(event) => {
        onHandleBlur(event.relatedTarget);
      }}
    >
      <div ref={rowRef} className="flex items-center gap-0.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label={ADD_LABEL}
              data-block-handle-add=""
              onMouseDown={keepEditorSelection}
              onPointerDown={keepEditorSelection}
              onClick={addBelow}
            >
              <Plus aria-hidden="true" />
            </Button>
          </TooltipTrigger>
          <TooltipContent data-block-handle-tooltip="">{ADD_LABEL}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              ref={gripRef}
              type="button"
              size="icon"
              variant="ghost"
              aria-label={BLOCK_MENU_GRIP_LABEL}
              data-block-handle-grip=""
              onMouseDown={(event) => {
                keepEditorSelection(event);
                event.stopPropagation();
              }}
              onPointerDown={(event) => {
                keepEditorSelection(event);
                event.stopPropagation();
              }}
              onClick={() => {
                openMenu.current(paint.target);
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
  ) : null;

  // The preview frame uses a drop-shadow filter, which would trap a fixed
  // overlay and clip it. The body portal keeps the gutter on the viewport.
  return createPortal(
    <>
      {handleNode}
      {menu}
    </>,
    document.body,
  );
}
