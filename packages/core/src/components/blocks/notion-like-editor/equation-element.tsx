import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import {
  PlateElement,
  useEditorRef,
  useFocused,
  usePluginOption,
  useReadOnly,
  useSelected,
  type PlateElementProps,
} from "platejs/react";

import { Popover, PopoverAnchor, PopoverContent } from "@/components/popover";
import { cn } from "@/lib/utils";

import {
  EQUATION_EMPTY_PLACEHOLDER,
  closeEquationEditor,
  equationPlugin,
  loadKatex,
  openEquationEditor,
  removeEquation,
  renderEquation,
  type EquationRender,
} from "./editor-equation";
import {
  MEDIA_TOOLBAR_CLASS,
  keepMediaSelection,
  mediaIconButtonClass,
} from "./media-element-parts";

import "katex/dist/katex.min.css";

type KatexModule = Parameters<typeof renderEquation>[0];

function storedExpression(element: PlateElementProps["element"]): string {
  return typeof element.texExpression === "string" ? element.texExpression : "";
}

function EquationView({
  expression,
  katex,
  empty,
}: {
  expression: string;
  katex: KatexModule | undefined;
  empty: "placeholder" | "blank";
}) {
  if (expression.length === 0) {
    if (empty === "blank") {
      return null;
    }
    return (
      <p data-equation-empty className="text-muted-foreground text-sm">
        {EQUATION_EMPTY_PLACEHOLDER}
      </p>
    );
  }

  if (!katex) {
    return <div data-equation-loading className="bg-muted h-8 max-w-xs rounded-md" />;
  }

  const rendered = renderEquation(katex, expression);
  if (!rendered.ok) {
    return <EquationError expression={expression} message={rendered.message} />;
  }

  // KaTeX positions .katex-mathml absolutely. This scroller is the containing
  // block so that span stays inside the scrollport instead of widening the page.
  return (
    <div data-equation-scroll className="relative max-w-full min-w-0 overflow-x-auto">
      <div
        data-equation-math
        className="text-foreground w-max"
        dangerouslySetInnerHTML={{ __html: rendered.html }}
      />
    </div>
  );
}

function EquationError({ expression, message }: { expression: string; message: string }) {
  return (
    <div data-equation-error className="max-w-full min-w-0">
      <p className="text-destructive/70 text-sm">{message}</p>
      <pre className="mt-1 max-w-full overflow-x-auto font-mono text-sm whitespace-pre">
        {expression}
      </pre>
    </div>
  );
}

export function EquationElement(props: PlateElementProps) {
  const editor = useEditorRef();
  const readOnly = useReadOnly();
  const selected = useSelected();
  const focused = useFocused();
  const editingId = usePluginOption(equationPlugin, "editingId");
  const expression = storedExpression(props.element);
  const elementId = typeof props.element.id === "string" ? props.element.id : "";
  const open = !readOnly && elementId.length > 0 && editingId === elementId;
  const [katex, setKatex] = useState<KatexModule | undefined>();
  const [draft, setDraft] = useState(expression);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const wasOpen = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void loadKatex().then((mod) => {
      if (!cancelled) {
        setKatex(mod);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const opening = open && !wasOpen.current;
    const closing = wasOpen.current && !open;
    wasOpen.current = open;
    if (opening) {
      setDraft(expression);
      textarea.current?.focus();
    }
    if (!closing) {
      return;
    }
    const path = editor.api.findPath(props.element);
    if (!path) {
      return;
    }
    const start = editor.api.start(path);
    editor.tf.withoutSaving(() => {
      if (start) {
        editor.tf.select(start);
      }
    });
    const node = editor.api.toDOMNode(props.element);
    const editable = node?.closest("[data-slate-editor]");
    if (editable instanceof HTMLElement) {
      editable.focus();
    }
  }, [editor, expression, open, props.element]);

  function finish(commitDraft: boolean): void {
    const path = editor.api.findPath(props.element);
    if (commitDraft && path && draft !== expression) {
      editor.tf.withNewBatch(() => {
        editor.tf.setNodes({ texExpression: draft }, { at: path });
      });
      editor.tf.setSplittingOnce(true);
    }
    closeEquationEditor(editor);
  }

  function openEditor(): void {
    if (readOnly || elementId.length === 0) {
      return;
    }
    openEquationEditor(editor, elementId);
  }

  function onTextKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>): void {
    event.stopPropagation();
    if (event.key === "Escape") {
      event.preventDefault();
      finish(false);
      return;
    }
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      finish(true);
    }
  }

  async function copySource(): Promise<void> {
    try {
      await navigator.clipboard.writeText(expression);
    } catch {
      // A denied clipboard leaves the source in the block.
    }
  }

  function remove(): void {
    const path = editor.api.findPath(props.element);
    if (!path) {
      return;
    }
    editor.tf.withNewBatch(() => {
      removeEquation(editor, path);
    });
    editor.tf.setSplittingOnce(true);
  }

  const preview: EquationRender | undefined =
    katex && draft.length > 0 ? renderEquation(katex, draft) : undefined;

  return (
    <PlateElement
      {...props}
      className={cn(
        "group relative my-2 max-w-full min-w-0",
        selected && focused && !readOnly && "ring-ring rounded-md ring-2",
      )}
    >
      <Popover
        open={open}
        onOpenChange={(next) => {
          // A click outside the popover drops the draft. Closing after Done
          // has already written, so this path only runs while the editor is open.
          if (!next && open) {
            finish(false);
          }
        }}
      >
        <PopoverAnchor asChild>
          <div contentEditable={false} className="max-w-full min-w-0" onClick={openEditor}>
            <EquationView
              expression={expression}
              katex={katex}
              empty={readOnly ? "blank" : "placeholder"}
            />
            {elementId.length === 0 ? null : (
              <div
                data-equation-toolbar
                className={cn(MEDIA_TOOLBAR_CLASS, selected && "pointer-events-auto opacity-100")}
                onClick={(event) => {
                  event.stopPropagation();
                }}
              >
                {readOnly ? null : (
                  <button
                    type="button"
                    aria-label="Edit"
                    className={mediaIconButtonClass}
                    onMouseDown={keepMediaSelection}
                    onClick={openEditor}
                  >
                    Edit
                  </button>
                )}
                <button
                  type="button"
                  aria-label="Copy source"
                  className={mediaIconButtonClass}
                  onMouseDown={keepMediaSelection}
                  onClick={() => {
                    void copySource();
                  }}
                >
                  Copy source
                </button>
                {readOnly ? null : (
                  <button
                    type="button"
                    aria-label="Remove"
                    className={mediaIconButtonClass}
                    onMouseDown={keepMediaSelection}
                    onClick={remove}
                  >
                    Remove
                  </button>
                )}
              </div>
            )}
          </div>
        </PopoverAnchor>
        <PopoverContent
          className="w-[min(28rem,calc(100vw-2rem))]"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
          }}
        >
          <textarea
            ref={textarea}
            aria-label="Equation source"
            className="border-input bg-background min-h-24 w-full rounded-md border p-2 font-mono text-sm"
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
            }}
            onKeyDown={onTextKeyDown}
          />
          <div data-equation-preview className="relative max-w-full min-w-0 overflow-x-auto">
            {draft.length === 0 ? (
              <p className="text-muted-foreground text-sm">{EQUATION_EMPTY_PLACEHOLDER}</p>
            ) : preview === undefined ? (
              <div data-equation-loading className="bg-muted h-8 rounded-md" />
            ) : preview.ok ? (
              <div
                className="text-foreground w-max"
                dangerouslySetInnerHTML={{ __html: preview.html }}
              />
            ) : (
              <EquationError expression={draft} message={preview.message} />
            )}
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className={mediaIconButtonClass} onClick={() => finish(false)}>
              Cancel
            </button>
            <button type="button" className={mediaIconButtonClass} onClick={() => finish(true)}>
              Done
            </button>
          </div>
        </PopoverContent>
      </Popover>
      {props.children}
    </PlateElement>
  );
}
