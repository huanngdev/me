import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { ElementApi, KEYS, type TElement } from "platejs";
import {
  PlateElement,
  useEditorRef,
  useElement,
  useReadOnly,
  type PlateElementProps,
} from "platejs/react";

import {
  clampAndNormalizeWidths,
  COLUMN_MIN_PERCENT,
  setColumnWidths,
} from "../../lib/commands/editor-columns";

import { COLUMN_GROUP_LAYOUT_CLASS } from "./column-classes";

export { COLUMN_GROUP_LAYOUT_CLASS };

const RESIZE_STEP = 5;
const RESIZE_SHIFT_STEP = 10;

function columnNodes(element: TElement): TElement[] {
  return element.children.filter(
    (child): child is TElement => ElementApi.isElement(child) && child.type === KEYS.column,
  );
}

function storedWidths(columns: readonly TElement[]): string[] {
  return columns.map((column) => (typeof column.width === "string" ? column.width : ""));
}

function widthNumbers(widths: readonly string[]): number[] {
  return widths.map((width) => {
    const parsed = Number.parseFloat(width);
    return Number.isFinite(parsed) ? parsed : 0;
  });
}

function sameWidths(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((width, index) => width === right[index]);
}

function columnTrackTemplate(widths: readonly string[]): string {
  return widths
    .map((width) => {
      const parsed = Number.parseFloat(width);
      return `${Number.isFinite(parsed) ? parsed : 1}fr`;
    })
    .join(" ");
}

function columnWidthStyle(template: string): { [key: `--${string}`]: string } {
  return { "--column-widths": template };
}

export function ColumnElement(props: PlateElementProps) {
  return (
    <PlateElement {...props} className="min-w-0">
      <div className="min-w-0">{props.children}</div>
    </PlateElement>
  );
}

export function ColumnGroupElement(props: PlateElementProps) {
  const editor = useEditorRef();
  const element = useElement();
  const readOnly = useReadOnly();
  const columns = columnNodes(element);
  const saved = storedWidths(columns);
  const [preview, setPreview] = useState<string[] | null>(null);
  // The handle being dragged, so its pill stays shown while the pointer is captured.
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ index: number; startX: number; width: number; start: number[] } | null>(
    null,
  );
  const shown = preview ?? saved;

  function commitWidths(numbers: readonly number[]): void {
    const path = editor.api.findPath(element);
    if (!path) {
      return;
    }

    const start = editor.api.start(path.concat([0, 0]));
    editor.tf.withoutNormalizing(() => {
      if (start) {
        editor.tf.select(start);
      }
      setColumnWidths(editor, numbers);
    });
  }

  function onResizeKey(index: number, key: string, shiftKey: boolean): void {
    const step = shiftKey ? RESIZE_SHIFT_STEP : RESIZE_STEP;
    const delta = key === "ArrowRight" ? step : -step;
    const numbers = widthNumbers(saved);
    const left = numbers[index];
    const right = numbers[index + 1];
    if (left === undefined || right === undefined) {
      return;
    }

    numbers[index] = left + delta;
    numbers[index + 1] = right - delta;
    const next = clampAndNormalizeWidths(numbers);
    if (sameWidths(next, saved)) {
      return;
    }

    editor.tf.withNewBatch(() => {
      commitWidths(numbers);
    });
    editor.tf.setSplittingOnce(true);
  }

  function onPointerDown(index: number, event: ReactPointerEvent<HTMLDivElement>): void {
    if (event.button !== 0) {
      return;
    }

    const width = gridRef.current?.getBoundingClientRect().width ?? 0;
    if (width <= 0) {
      return;
    }

    event.preventDefault();
    dragRef.current = { index, startX: event.clientX, width, start: widthNumbers(saved) };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragIndex(index);
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>): void {
    const drag = dragRef.current;
    if (!drag) {
      return;
    }

    const delta = ((event.clientX - drag.startX) / drag.width) * 100;
    const numbers = drag.start.slice();
    const left = numbers[drag.index];
    const right = numbers[drag.index + 1];
    if (left === undefined || right === undefined) {
      return;
    }

    numbers[drag.index] = left + delta;
    numbers[drag.index + 1] = right - delta;
    setPreview(clampAndNormalizeWidths(numbers));
  }

  function onPointerUp(event: ReactPointerEvent<HTMLDivElement>): void {
    const drag = dragRef.current;
    dragRef.current = null;
    setPreview(null);
    setDragIndex(null);
    if (!drag) {
      return;
    }

    const delta = ((event.clientX - drag.startX) / drag.width) * 100;
    const numbers = drag.start.slice();
    const left = numbers[drag.index];
    const right = numbers[drag.index + 1];
    if (left === undefined || right === undefined) {
      return;
    }

    numbers[drag.index] = left + delta;
    numbers[drag.index + 1] = right - delta;
    const next = clampAndNormalizeWidths(numbers);
    if (sameWidths(next, saved)) {
      return;
    }

    editor.tf.withNewBatch(() => {
      commitWidths(numbers);
    });
    editor.tf.setSplittingOnce(true);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  return (
    <PlateElement {...props} className="group/columns relative my-2">
      <div
        ref={gridRef}
        data-column-layout="stack"
        className={COLUMN_GROUP_LAYOUT_CLASS}
        style={columnWidthStyle(columnTrackTemplate(shown))}
      >
        {props.children}
      </div>
      {readOnly ? null : (
        <>
          {columns.slice(0, -1).map((_, index) => {
            const widths = widthNumbers(shown);
            const left = widths.slice(0, index + 1).reduce((total, value) => total + value, 0);
            // The value is the rounded width of the column on the left. The limits match
            // clampAndNormalizeWidths, so the value stays in range.
            const leftWidth = Math.round(widths[index] ?? 0);
            const maxWidth = 100 - COLUMN_MIN_PERCENT * (columns.length - 1);
            return (
              // A resize handle is dragged and stepped with the arrow keys. It is a
              // separator, not a Button, because it does not run a command.
              <div
                key={index}
                role="separator"
                aria-orientation="vertical"
                aria-label={`Resize column ${index + 1}`}
                aria-valuenow={leftWidth}
                aria-valuemin={COLUMN_MIN_PERCENT}
                aria-valuemax={maxWidth}
                tabIndex={0}
                data-column-resize={index}
                data-dragging={dragIndex === index ? "" : undefined}
                className="group/handle absolute top-1 bottom-1 z-10 hidden w-3 -translate-x-1/2 cursor-col-resize rounded-full sm:block"
                style={{ left: `${left}%` }}
                onPointerDown={(event) => {
                  onPointerDown(index, event);
                }}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onKeyDown={(event) => {
                  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
                    return;
                  }
                  event.preventDefault();
                  onResizeKey(index, event.key, event.shiftKey);
                }}
              >
                {/* The visible pill. It is hidden until the columns, the handle or its focus are active. */}
                <span
                  aria-hidden="true"
                  className="bg-foreground/40 group-hover/handle:bg-foreground/60 group-focus-visible/handle:bg-foreground/60 group-focus-visible/handle:ring-ring/50 group-data-[dragging]/handle:bg-foreground/60 absolute top-1/2 left-1/2 h-12 max-h-full w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full opacity-0 transition-[opacity,background-color] duration-150 ease-out group-hover/columns:opacity-100 group-hover/handle:opacity-100 group-focus-visible/handle:opacity-100 group-focus-visible/handle:ring-[3px] group-data-[dragging]/handle:opacity-100 motion-reduce:transition-none"
                />
              </div>
            );
          })}
        </>
      )}
    </PlateElement>
  );
}
