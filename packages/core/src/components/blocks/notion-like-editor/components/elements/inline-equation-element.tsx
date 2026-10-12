import { useEffect, useState, type ReactNode } from "react";
import {
  PlateElement,
  useFocused,
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
import { INLINE_EQUATION_CLASS } from "./inline-equation-classes";

import "katex/dist/katex.min.css";

type KatexModule = Parameters<typeof renderInlineEquation>[0];

export function InlineEquationElement(props: PlateElementProps) {
  const readOnly = useReadOnly();
  const selected = useSelected();
  const focused = useFocused();
  const expression =
    typeof props.element.texExpression === "string" ? props.element.texExpression : "";
  const [katex, setKatex] = useState<KatexModule | undefined>();

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
      <span contentEditable={false} data-inline-equation="">
        {body}
      </span>
      {props.children}
    </PlateElement>
  );
}
