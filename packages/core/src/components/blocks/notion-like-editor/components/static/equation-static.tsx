import katex from "katex";
import { SlateElement, type SlateElementProps } from "platejs/static";

import {
  EQUATION_EMPTY_PLACEHOLDER,
  renderEquation,
} from "../../lib/features/editor-equation-render";
import { EQUATION_BLOCK_CLASS } from "../elements/equation-classes";

import "katex/dist/katex.min.css";

export function EquationStatic(props: SlateElementProps) {
  const expression =
    typeof props.element.texExpression === "string" ? props.element.texExpression : "";
  let body = null;
  if (expression.length === 0) {
    body = (
      <p data-equation-empty className="text-muted-foreground text-center text-sm">
        {EQUATION_EMPTY_PLACEHOLDER}
      </p>
    );
  } else {
    const rendered = renderEquation(katex, expression);
    body = rendered.ok ? (
      <div
        data-equation-math
        className="text-foreground"
        dangerouslySetInnerHTML={{ __html: rendered.html }}
      />
    ) : (
      <div data-equation-error className="max-w-full min-w-0">
        <p className="text-destructive/70 text-sm">{rendered.message}</p>
        <pre className="font-mono text-sm whitespace-pre">{expression}</pre>
      </div>
    );
  }

  return (
    <SlateElement {...props} className={EQUATION_BLOCK_CLASS}>
      <div className="max-w-full min-w-0">
        <div data-equation-scroll className="scroll-fade-x relative max-w-full min-w-0">
          <div className="flex w-max min-w-full justify-center">{body}</div>
        </div>
      </div>
      {props.children}
    </SlateElement>
  );
}
