import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import {
  PlateElement,
  useEditorRef,
  useFocused,
  usePluginOption,
  useReadOnly,
  useSelected,
  type PlateElementProps,
} from "platejs/react";

import { Check, Copy, Trash2, X } from "lucide-react";

import { Popover, PopoverAnchor, PopoverContent } from "@/components/popover";
import { Textarea } from "@/components/textarea";
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
} from "../../lib/features/editor-equation";
import {
  EditorIconButton,
  EditorTextButton,
  focusEditorWithoutScroll,
  retainScroll,
} from "../ui/block-toolbar";

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
  let body: ReactNode = null;
  if (expression.length === 0) {
    body =
      empty === "blank" ? null : (
        <p data-equation-empty className="text-muted-foreground text-center text-sm">
          {EQUATION_EMPTY_PLACEHOLDER}
        </p>
      );
  } else if (!katex) {
    body = <div data-equation-loading className="bg-background h-8 w-full max-w-xs rounded-md" />;
  } else {
    const rendered = renderEquation(katex, expression);
    body = rendered.ok ? (
      <div
        data-equation-math
        className="text-foreground"
        dangerouslySetInnerHTML={{ __html: rendered.html }}
      />
    ) : (
      <EquationError expression={expression} message={rendered.message} />
    );
  }

  if (body === null) {
    return null;
  }

  // KaTeX positions .katex-mathml absolutely. This scroller is the containing
  // block so that span stays inside the scrollport instead of widening the page.
  // min-w-full centers a short expression; w-max lets a longer one scroll.
  return (
    <div data-equation-scroll className="relative max-w-full min-w-0 overflow-x-auto">
      <div className="flex w-max min-w-full justify-center">{body}</div>
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
      textarea.current?.focus({ preventScroll: true });
    }
    if (!closing) {
      return;
    }
    const path = editor.api.findPath(props.element);
    if (!path) {
      return;
    }
    const start = editor.api.start(path);
    const node = editor.api.toDOMNode(props.element);
    const editable = node?.closest("[data-slate-editor]") ?? null;
    retainScroll(() => {
      editor.tf.withoutSaving(() => {
        if (start) {
          editor.tf.select(start);
        }
      });
      focusEditorWithoutScroll(editable);
    });
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

  async function copySource(source: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(source);
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
        "group bg-muted relative my-2 max-w-full min-w-0 rounded-md px-3 py-2",
        selected && focused && !readOnly && "bg-muted",
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
          </div>
        </PopoverAnchor>
        <PopoverContent
          className="w-[min(28rem,calc(100vw-2rem))]"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
          }}
        >
          <Textarea
            ref={textarea}
            aria-label="Equation source"
            className="min-h-24 font-mono"
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
          <div className="flex flex-wrap justify-end gap-2">
            <EditorTextButton
              variant="outline"
              label="Copy source"
              icon={<Copy aria-hidden="true" />}
              onClick={() => {
                void copySource(draft);
              }}
            />
            <EditorTextButton
              variant="destructive"
              label="Remove"
              icon={<Trash2 aria-hidden="true" />}
              onClick={remove}
            />
            <EditorTextButton
              variant="outline"
              label="Cancel"
              icon={<X aria-hidden="true" />}
              onClick={() => finish(false)}
            />
            <EditorTextButton
              variant="default"
              label="Done"
              icon={<Check aria-hidden="true" />}
              onClick={() => finish(true)}
            />
          </div>
        </PopoverContent>
      </Popover>
      {readOnly && expression.length > 0 ? (
        <div className="mt-1 flex justify-end" contentEditable={false}>
          <EditorIconButton
            label="Copy source"
            icon={<Copy aria-hidden="true" />}
            onClick={() => {
              void copySource(expression);
            }}
          />
        </div>
      ) : null}
      {props.children}
    </PlateElement>
  );
}
