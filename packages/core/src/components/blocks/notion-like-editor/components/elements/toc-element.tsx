import { type KeyboardEvent as ReactKeyboardEvent } from "react";
import {
  PlateElement,
  useEditorRef,
  useEditorSelector,
  useReadOnly,
  useSelected,
  type PlateElementProps,
} from "platejs/react";

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
import { MEDIA_TOOLBAR_CLASS, keepMediaSelection, mediaIconButtonClass } from "../ui/block-toolbar";

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
    <PlateElement {...props} className="group relative my-2">
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
                return (
                  <li key={entry.id} className={indentClass(entry.depth - shallowest)}>
                    <button
                      type="button"
                      data-toc-target={entry.id}
                      data-toc-indent={entry.depth - shallowest}
                      data-toc-untitled={untitled ? "true" : undefined}
                      className={cn(
                        "text-foreground hover:bg-muted w-full rounded-sm px-1 py-0.5 text-left text-sm break-words",
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
                      {untitled ? TOC_UNTITLED : entry.title}
                    </button>
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
            <select
              aria-label="Table of contents depth"
              className={mediaIconButtonClass}
              value={String(depth)}
              onMouseDown={keepMediaSelection}
              onChange={(event) => {
                const next = Number(event.target.value);
                if (!isTocDepth(next)) {
                  return;
                }
                runOnToc(() => {
                  setTocDepth(editor, path, next);
                });
              }}
            >
              <option value="1">H1 only</option>
              <option value="2">H1–H2</option>
              <option value="3">H1–H3</option>
            </select>
            <button
              type="button"
              aria-label="Remove"
              className={mediaIconButtonClass}
              onMouseDown={keepMediaSelection}
              onClick={() => {
                runOnToc(() => {
                  removeToc(editor, path);
                });
              }}
            >
              Remove
            </button>
          </div>
        )}
      </div>
      {props.children}
    </PlateElement>
  );
}
