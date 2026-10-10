import { useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { GripVertical, Plus } from "lucide-react";

import { Button } from "@/components/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/tooltip";
import { cn } from "@/lib/utils";

import { useBlockHandle } from "../../hooks/use-block-handle";

const ADD_LABEL = "Click to add below";
const GRIP_LABEL = "Drag to move";

type BlockHandleProps = {
  onInsertedBelow?: (blockId: string) => void;
};

function keepEditorSelection(event: { preventDefault: () => void }): void {
  event.preventDefault();
}

export function BlockHandle({ onInsertedBelow }: BlockHandleProps) {
  const handle = useBlockHandle({ onInsertedBelow });
  const { paint, setMeasuredSize, shown, suppressed, addBelow, onHandleFocus, onHandleBlur } =
    handle;
  const rowRef = useRef<HTMLDivElement>(null);
  const gripRef = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => {
    const row = rowRef.current;
    if (!row) {
      return;
    }
    setMeasuredSize(row.offsetWidth, row.offsetHeight);
  }, [paint, setMeasuredSize]);

  if (suppressed || !paint) {
    return null;
  }
  // Stop at the block edge. A pixel inside the box covers a control that sits
  // on that edge, such as the toggle chevron.
  const gutterWidth = Math.max(0, paint.blockLeft - (paint.left + paint.width));
  const gutterTop = paint.blockTop - paint.top;
  const gutterHeight = Math.max(paint.height, paint.blockBottom - paint.blockTop);

  const handleNode = (
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
              aria-label={GRIP_LABEL}
              data-block-handle-grip=""
              onMouseDown={keepEditorSelection}
              onPointerDown={keepEditorSelection}
            >
              <GripVertical aria-hidden="true" />
            </Button>
          </TooltipTrigger>
          <TooltipContent data-block-handle-tooltip="">{GRIP_LABEL}</TooltipContent>
        </Tooltip>
      </div>
      <div
        data-block-handle-gutter=""
        aria-hidden="true"
        className="absolute"
        style={{ left: "100%", top: gutterTop, width: gutterWidth, height: gutterHeight }}
      />
    </div>
  );

  // The preview frame uses a drop-shadow filter, which would trap a fixed
  // overlay and clip it. The body portal keeps the gutter on the viewport.
  return createPortal(handleNode, document.body);
}
