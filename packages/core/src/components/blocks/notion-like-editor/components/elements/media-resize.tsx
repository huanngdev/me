import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import { useEditorRef } from "platejs/react";

import { cn } from "@/lib/utils";

import {
  MEDIA_WIDTH_MAX,
  MEDIA_WIDTH_MIN,
  dragMediaWidth,
  keyMediaWidth,
  naturalMediaPercent,
  type MediaAlign,
} from "../../lib/features/editor-media-layout";
import { onPopoverHistoryKey } from "../../lib/plugins/editor-popover-history";

// The resize handles of an image or video block, and the width they write. A drag writes nothing
// until the pointer is up. Escape cancels it. The parent shows the preview width while a drag runs.

// The rendered width of a block as a whole percent of the column, read now from the DOM.
function measuredMediaPercent(
  anchor: HTMLElement | null,
  figure: HTMLElement | null,
): number | undefined {
  return naturalMediaPercent(
    figure?.getBoundingClientRect().width ?? 0,
    anchor?.getBoundingClientRect().width ?? 0,
  );
}

// The rendered width of a block with no stored width, for the handles' value. It is measured after
// layout, once `active` is true, and again when the column resizes. `remeasure` reads it at once.
export function useNaturalMediaPercent(
  anchorRef: RefObject<HTMLElement | null>,
  figureRef: RefObject<HTMLElement | null>,
  active: boolean,
): { natural: number | undefined; remeasure: () => void } {
  const [natural, setNatural] = useState<number | undefined>(undefined);
  const remeasure = useCallback(() => {
    const measured = measuredMediaPercent(anchorRef.current, figureRef.current);
    if (measured !== undefined) {
      setNatural(measured);
    }
  }, [anchorRef, figureRef]);

  useLayoutEffect(() => {
    if (active) {
      remeasure();
    }
  }, [active, remeasure]);

  useEffect(() => {
    const node = anchorRef.current;
    if (!active || node === null || typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver(() => {
      remeasure();
    });
    observer.observe(node);
    return () => {
      observer.disconnect();
    };
  }, [active, anchorRef, remeasure]);

  return { natural, remeasure };
}

type DragState = {
  side: "left" | "right";
  pointerId: number;
  target: HTMLElement;
  startX: number;
  columnPx: number;
  start: number;
  stored: number | undefined;
  moved: boolean;
  align: MediaAlign | undefined;
  latest: number;
  detach: () => void;
};

type MediaResizeKind = "image" | "video" | "embed";

// The two edge handles of a block that is selected and ready. `value` is the width the handles report.
// `onPreview` gets the width during a drag, and null when the drag ends. `onCommit` gets the final width.
export function MediaResizeHandles({
  kind,
  label,
  width,
  align,
  value,
  anchorRef,
  figureRef,
  onPreview,
  onCommit,
}: {
  kind: MediaResizeKind;
  label: string;
  width: number | undefined;
  align: MediaAlign | undefined;
  value: number;
  anchorRef: RefObject<HTMLElement | null>;
  figureRef: RefObject<HTMLElement | null>;
  onPreview: (width: number | null) => void;
  onCommit: (width: number) => void;
}) {
  const editor = useEditorRef();
  const dragRef = useRef<DragState | null>(null);

  // Escape cancels a drag. Pointer up writes the last preview when it differs from the stored width.
  // No stored width counts as different.
  function endDrag(commit: boolean): void {
    const drag = dragRef.current;
    if (drag === null) {
      return;
    }

    dragRef.current = null;
    drag.detach();
    if (drag.target.hasPointerCapture(drag.pointerId)) {
      drag.target.releasePointerCapture(drag.pointerId);
    }
    onPreview(null);
    if (commit && drag.moved && drag.latest !== drag.stored) {
      onCommit(drag.latest);
    }
  }

  function startDrag(side: "left" | "right", event: ReactPointerEvent<HTMLDivElement>): void {
    const columnPx = anchorRef.current?.getBoundingClientRect().width ?? 0;
    const start = width ?? measuredMediaPercent(anchorRef.current, figureRef.current);
    if (event.button !== 0 || dragRef.current !== null || !(columnPx > 0) || start === undefined) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const onKey = (keyEvent: KeyboardEvent): void => {
      if (keyEvent.key === "Escape") {
        keyEvent.preventDefault();
        endDrag(false);
      }
    };
    window.addEventListener("keydown", onKey, true);
    dragRef.current = {
      side,
      pointerId: event.pointerId,
      target: event.currentTarget,
      startX: event.clientX,
      columnPx,
      start,
      stored: width,
      moved: false,
      align,
      latest: start,
      detach: () => {
        window.removeEventListener("keydown", onKey, true);
      },
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveDrag(event: ReactPointerEvent<HTMLDivElement>): void {
    const drag = dragRef.current;
    if (drag === null || drag.pointerId !== event.pointerId) {
      return;
    }

    drag.latest = dragMediaWidth({
      start: drag.start,
      deltaPx: event.clientX - drag.startX,
      columnPx: drag.columnPx,
      handle: drag.side,
      align: drag.align,
    });
    drag.moved = true;
    onPreview(drag.latest);
  }

  // A key starts from the stored width, or from the rendered width read now.
  function onHandleKey(event: ReactKeyboardEvent<HTMLDivElement>): void {
    if (onPopoverHistoryKey(editor, event)) {
      event.stopPropagation();
      return;
    }

    const base = width ?? measuredMediaPercent(anchorRef.current, figureRef.current);
    const next = base === undefined ? null : keyMediaWidth(base, event.key, event.shiftKey);
    if (next === null || base === undefined) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    if (next !== base) {
      onCommit(next);
    }
  }

  function renderHandle(side: "left" | "right") {
    const attr =
      kind === "image"
        ? { "data-image-resize": side }
        : kind === "video"
          ? { "data-video-resize": side }
          : { "data-embed-resize": side };
    return (
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={label}
        aria-valuenow={value}
        aria-valuemin={MEDIA_WIDTH_MIN}
        aria-valuemax={MEDIA_WIDTH_MAX}
        tabIndex={0}
        {...attr}
        className={cn(
          "focus-visible:ring-ring/50 absolute top-1/2 h-12 w-1.5 -translate-y-1/2 cursor-col-resize touch-none rounded-full bg-black/40 focus-visible:ring-[3px] focus-visible:outline-none",
          side === "left" ? "left-2" : "right-2",
        )}
        onPointerDown={(event) => {
          startDrag(side, event);
        }}
        onPointerMove={moveDrag}
        onPointerUp={(event) => {
          if (dragRef.current?.pointerId === event.pointerId) {
            endDrag(true);
          }
        }}
        onPointerCancel={() => {
          endDrag(false);
        }}
        onLostPointerCapture={() => {
          endDrag(false);
        }}
        onKeyDown={onHandleKey}
      />
    );
  }

  return (
    <>
      {renderHandle("left")}
      {renderHandle("right")}
    </>
  );
}
