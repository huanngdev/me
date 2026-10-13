import { useEffect, useState, type ReactNode } from "react";
import {
  PlateElement,
  useEditorRef,
  useFocused,
  usePluginOption,
  useReadOnly,
  useSelected,
  type PlateElementProps,
} from "platejs/react";

import { cn } from "@/lib/utils";

import { loadKatex } from "../../lib/features/editor-equation";
import {
  INLINE_EQUATION_EMPTY_PLACEHOLDER,
  renderInlineEquation,
} from "../../lib/features/editor-equation-render";
import {
  cancelInlineEquationEditor,
  inlineEquationUiPlugin,
  openInlineEquationEditor,
} from "../../lib/plugins/editor-inline-equation-ui";
import { InlineEquationPopover } from "../ui/inline-equation-popover";
import { INLINE_EQUATION_CLASS } from "./inline-equation-classes";

import "katex/dist/katex.min.css";

type KatexModule = Parameters<typeof renderInlineEquation>[0];

export function InlineEquationElement(props: PlateElementProps) {
  const editor = useEditorRef();
  const readOnly = useReadOnly();
  const selected = useSelected();
  const focused = useFocused();
  const id = typeof props.element.id === "string" ? props.element.id : "";
  const editingId = usePluginOption(inlineEquationUiPlugin, "editingId");
  const draft = usePluginOption(inlineEquationUiPlugin, "draft");
  const stored = typeof props.element.texExpression === "string" ? props.element.texExpression : "";
  // While the popover is open the preview shows the draft. The document keeps the stored source.
  const open = !readOnly && id.length > 0 && editingId === id;
  const expression = open ? draft : stored;
  const [katex, setKatex] = useState<KatexModule | undefined>();

  // A switch to read-only cancels the open draft. The plugin cannot see a read-only prop change
  // (no editor change happens), so this stays here. Removal is handled in the plugin's onChange.
  useEffect(() => {
    if (readOnly && editingId === id) {
      cancelInlineEquationEditor(editor);
    }
  }, [editingId, editor, id, readOnly]);

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

  let body: ReactNode;
  if (expression.length === 0) {
    body = (
      <span data-inline-equation-empty className="text-muted-foreground">
        {INLINE_EQUATION_EMPTY_PLACEHOLDER}
      </span>
    );
  } else if (!katex) {
    // The raw source keeps the line the same width until KaTeX arrives.
    body = <span className="font-mono">{expression}</span>;
  } else {
    const rendered = renderInlineEquation(katex, expression);
    body = rendered.ok ? (
      <span
        data-inline-equation-math
        className="text-foreground"
        dangerouslySetInnerHTML={{ __html: rendered.html }}
      />
    ) : (
      <span
        data-inline-equation-error
        title={rendered.message}
        className="text-destructive font-mono"
      >
        {expression}
      </span>
    );
  }

  return (
    <PlateElement
      {...props}
      as="span"
      className={cn(
        INLINE_EQUATION_CLASS,
        selected && focused && !readOnly && "bg-muted rounded-sm",
      )}
    >
      <span
        contentEditable={false}
        data-inline-equation=""
        onClick={
          readOnly
            ? undefined
            : () => {
                openInlineEquationEditor(editor, id);
              }
        }
      >
        {body}
      </span>
      {readOnly ? null : <InlineEquationPopover id={id} />}
      {props.children}
    </PlateElement>
  );
}
