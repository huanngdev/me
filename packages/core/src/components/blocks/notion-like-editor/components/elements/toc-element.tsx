import { type KeyboardEvent as ReactKeyboardEvent } from "react";
import {
  PlateElement,
  useEditorRef,
  useEditorSelector,
  useFocused,
  useReadOnly,
  useSelected,
  type PlateElementProps,
} from "platejs/react";

import { ChevronDown, Trash2 } from "lucide-react";

import { Button } from "@/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/dropdown-menu";
import { cn } from "@/lib/utils";

import {
  TOC_EMPTY_PLACEHOLDER,
  TOC_UNTITLED,
  activateTocEntry,
  isTocDepth,
  removeToc,
  setTocDepth,
  shallowestDepth,
  storedTocDepth,
  tocEntries,
  type TocEntry,
} from "../../lib/features/editor-toc";
import { BLOCK_SELECTED_CLASS } from "./hr-element";
import { MENU_ITEM_ACTIVE_CHECKED } from "../../lib/features/editor-menu-active";
import {
  MEDIA_TOOLBAR_CLASS,
  EditorMenuTrigger,
  EditorTextButton,
  keepMediaSelection,
} from "../ui/block-toolbar";

const TOC_DEPTH_LABEL = {
  1: "H1 only",
  2: "H1–H2",
  3: "H1–H3",
} as const;

const TOC_INDENT_CLASS = ["ps-0", "ps-4", "ps-8"] as const;

function indentClass(level: number): string {
  if (level === 1) {
    return TOC_INDENT_CLASS[1];
  }
  if (level >= 2) {
    return TOC_INDENT_CLASS[2];
  }
  return TOC_INDENT_CLASS[0];
}

export function TocElement(props: PlateElementProps) {
  const editor = useEditorRef();
  const readOnly = useReadOnly();
  const selected = useSelected();
  const focused = useFocused();
  const depth = storedTocDepth(props.element);
  const entries = useEditorSelector(() => tocEntries(editor, depth), [depth]);
  const shallowest = shallowestDepth(entries);
  const path = editor.api.findPath(props.element);

  function runOnToc(run: () => void): void {
    if (!path) {
      return;
    }
    const start = editor.api.start(path);
    editor.tf.withNewBatch(() => {
      if (start) {
        editor.tf.select(start);
      }
      run();
    });
    editor.tf.setSplittingOnce(true);
  }

  function activate(entry: TocEntry): void {
    activateTocEntry(editor, entry, readOnly);
  }

  function onKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>, entry: TocEntry): void {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }
    event.preventDefault();
    activate(entry);
  }

  return (
    <PlateElement
      {...props}
      className={cn(
        "group relative my-2 rounded-md",
        selected && focused && !readOnly && BLOCK_SELECTED_CLASS,
      )}
    >
      <div contentEditable={false}>
        {entries.length === 0 ? (
          readOnly ? null : (
            <p data-toc-empty className="text-muted-foreground text-sm">
              {TOC_EMPTY_PLACEHOLDER}
            </p>
          )
        ) : (
          <nav aria-label="Table of contents" data-toc-depth={depth}>
            <ol className="m-0 list-none space-y-1 p-0">
              {entries.map((entry) => {
                const untitled = entry.title.length === 0;
                const label = untitled ? TOC_UNTITLED : entry.title;
                return (
                  <li key={entry.id} className={indentClass(entry.depth - shallowest)}>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label={label}
                      data-toc-target={entry.id}
                      data-toc-indent={entry.depth - shallowest}
                      data-toc-untitled={untitled ? "true" : undefined}
                      className={cn(
                        "h-auto w-full justify-start px-1 whitespace-normal",
                        untitled && "text-muted-foreground",
                      )}
                      onMouseDown={keepMediaSelection}
                      onClick={() => {
                        activate(entry);
                      }}
                      onKeyDown={(event) => {
                        onKeyDown(event, entry);
                      }}
                    >
                      {label}
                    </Button>
                  </li>
                );
              })}
            </ol>
          </nav>
        )}
        {readOnly || !path ? null : (
          <div
            data-toc-toolbar
            className={cn(MEDIA_TOOLBAR_CLASS, selected && "pointer-events-auto opacity-100")}
          >
            <DropdownMenu modal={false}>
              <EditorMenuTrigger
                label="Table of contents depth"
                text={isTocDepth(depth) ? TOC_DEPTH_LABEL[depth] : TOC_DEPTH_LABEL[3]}
                icon={<ChevronDown aria-hidden="true" />}
                onMouseDown={keepMediaSelection}
              />
              <DropdownMenuContent
                align="end"
                collisionPadding={8}
                hideWhenDetached
                onCloseAutoFocus={(event) => {
                  event.preventDefault();
                }}
              >
                <DropdownMenuRadioGroup
                  value={String(isTocDepth(depth) ? depth : 3)}
                  onValueChange={(value) => {
                    if (value !== "1" && value !== "2" && value !== "3") {
                      return;
                    }
                    const choice = Number(value) as 1 | 2 | 3;
                    runOnToc(() => {
                      setTocDepth(editor, path, choice);
                    });
                  }}
                >
                  {([1, 2, 3] as const).map((choice) => (
                    <DropdownMenuRadioItem
                      key={choice}
                      value={String(choice)}
                      className={MENU_ITEM_ACTIVE_CHECKED}
                      onMouseDown={keepMediaSelection}
                    >
                      {TOC_DEPTH_LABEL[choice]}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            <EditorTextButton
              variant="destructive"
              label="Delete"
              icon={<Trash2 aria-hidden="true" />}
              onMouseDown={keepMediaSelection}
              onClick={() => {
                runOnToc(() => {
                  removeToc(editor, path);
                });
              }}
            />
          </div>
        )}
      </div>
      {props.children}
    </PlateElement>
  );
}
