import katex from "katex";
import { SlateElement, type SlateElementProps } from "platejs/static";
import type { ReactNode } from "react";

import {
  INLINE_EQUATION_EMPTY_PLACEHOLDER,
  renderInlineEquation,
} from "../../lib/features/editor-equation-render";
import { INLINE_EQUATION_CLASS } from "../elements/inline-equation-classes";

import "katex/dist/katex.min.css";

export function InlineEquationStatic(props: SlateElementProps) {
  const expression =
    typeof props.element.texExpression === "string" ? props.element.texExpression : "";
  let body: ReactNode;
  if (expression.length === 0) {
    body = (
      <span data-inline-equation-empty className="text-muted-foreground">
        {INLINE_EQUATION_EMPTY_PLACEHOLDER}
      </span>
    );
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
    <SlateElement {...props} as="span" className={INLINE_EQUATION_CLASS}>
      <span data-inline-equation="">{body}</span>
      {props.children}
    </SlateElement>
  );
}
