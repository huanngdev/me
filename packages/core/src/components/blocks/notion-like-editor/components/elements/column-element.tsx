import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Columns2, Columns3, Trash2, Ungroup } from "lucide-react";
import { ElementApi, KEYS, type TElement } from "platejs";
import {
  PlateElement,
  useEditorRef,
  useEditorSelector,
  useElement,
  useReadOnly,
  useSelected,
  type PlateElementProps,
} from "platejs/react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/dropdown-menu";
import { cn } from "@/lib/utils";

import {
  clampAndNormalizeWidths,
  removeColumnGroup,
  setColumnCount,
  setColumnWidths,
  unwrapColumns,
} from "../../lib/commands/editor-columns";
import { MENU_ITEM_ACTIVE_CHECKED } from "../../lib/features/editor-menu-active";
import {
  MEDIA_TOOLBAR_CLASS,
  EditorMenuTrigger,
  EditorTextButton,
  keepMediaSelection,
} from "../ui/block-toolbar";

export const COLUMN_GROUP_LAYOUT_CLASS =
  "grid grid-cols-1 gap-4 sm:[grid-template-columns:var(--column-widths)]";
export const COLUMN_GROUP_SELECTED_CLASS = "rounded-md bg-muted";
export const COLUMN_REMOVE_CONFIRM = "Delete columns and content?";

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
  const selected = useSelected();
  const columns = columnNodes(element);
  const saved = storedWidths(columns);
  const [preview, setPreview] = useState<string[] | null>(null);
  const [confirmKey, setConfirmKey] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ index: number; startX: number; width: number; start: number[] } | null>(
    null,
  );
  const shown = preview ?? saved;
  const selectionKey = useEditorSelector((instance) => JSON.stringify(instance.selection), []);
  const confirmRemove = confirmKey !== null && confirmKey === selectionKey;

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

  function runOnGroup(run: () => void): void {
    const path = editor.api.findPath(element);
    const start = path ? editor.api.start(path.concat([0, 0])) : undefined;
    editor.tf.withNewBatch(() => {
      if (start) {
        editor.tf.select(start);
      }
      run();
    });
    editor.tf.setSplittingOnce(true);
  }

  return (
    <PlateElement
      {...props}
      className={cn(
        "group group/columns relative my-2",
        !readOnly && selected && COLUMN_GROUP_SELECTED_CLASS,
      )}
    >
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
            const left = widthNumbers(shown)
              .slice(0, index + 1)
              .reduce((total, value) => total + value, 0);
            return (
              // A resize handle is dragged and stepped with the arrow keys. It is a
              // separator, not a Button, because it does not run a command.
              <div
                key={index}
                role="separator"
                aria-orientation="vertical"
                aria-label={`Resize column ${index + 1}`}
                tabIndex={0}
                data-column-resize={index}
                className="hover:bg-border focus-visible:bg-border absolute top-1 bottom-1 z-10 hidden w-3 -translate-x-1/2 cursor-col-resize rounded-full sm:block"
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
              />
            );
          })}
          <div
            data-column-toolbar
            className={cn(MEDIA_TOOLBAR_CLASS, selected && "pointer-events-auto opacity-100")}
          >
            <DropdownMenu modal={false}>
              <EditorMenuTrigger
                label="Columns"
                text="Columns"
                icon={
                  columns.length === 3 ? (
                    <Columns3 aria-hidden="true" />
                  ) : (
                    <Columns2 aria-hidden="true" />
                  )
                }
                onMouseDown={keepMediaSelection}
              />
              <DropdownMenuContent
                align="start"
                collisionPadding={8}
                hideWhenDetached
                onCloseAutoFocus={(event) => {
                  event.preventDefault();
                }}
              >
                <DropdownMenuRadioGroup
                  value={columns.length === 3 ? "3" : "2"}
                  onValueChange={(next) => {
                    if (next !== "2" && next !== "3") {
                      return;
                    }
                    runOnGroup(() => {
                      setColumnCount(editor, next === "3" ? 3 : 2);
                    });
                  }}
                >
                  <DropdownMenuRadioItem
                    value="2"
                    className={MENU_ITEM_ACTIVE_CHECKED}
                    onMouseDown={keepMediaSelection}
                  >
                    2 columns
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem
                    value="3"
                    className={MENU_ITEM_ACTIVE_CHECKED}
                    onMouseDown={keepMediaSelection}
                  >
                    3 columns
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            <EditorTextButton
              label="Turn into blocks"
              icon={<Ungroup aria-hidden="true" />}
              onMouseDown={keepMediaSelection}
              onClick={() => {
                runOnGroup(() => {
                  unwrapColumns(editor);
                });
              }}
            />
            <EditorTextButton
              variant="destructive"
              label={confirmRemove ? COLUMN_REMOVE_CONFIRM : "Delete"}
              icon={<Trash2 aria-hidden="true" />}
              onMouseDown={keepMediaSelection}
              onClick={() => {
                if (!confirmRemove) {
                  setConfirmKey(selectionKey);
                  return;
                }
                runOnGroup(() => {
                  removeColumnGroup(editor);
                });
              }}
            />
          </div>
        </>
      )}
    </PlateElement>
  );
}
