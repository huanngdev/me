import type { KatexOptions } from "katex";

export const EQUATION_EMPTY_PLACEHOLDER = "Add an equation";

export const EQUATION_KATEX_OPTIONS = {
  displayMode: true,
  throwOnError: true,
  trust: false,
  strict: "ignore",
  maxSize: 10,
  maxExpand: 1000,
  output: "htmlAndMathml",
} as const satisfies KatexOptions;

type KatexModule = {
  renderToString: (expression: string, options: KatexOptions) => string;
};

export const INLINE_EQUATION_EMPTY_PLACEHOLDER = "New equation";

export const INLINE_EQUATION_KATEX_OPTIONS = {
  ...EQUATION_KATEX_OPTIONS,
  displayMode: false,
} as const satisfies KatexOptions;

export type EquationRender = { ok: true; html: string } | { ok: false; message: string };

export function renderEquation(katex: KatexModule, expression: string): EquationRender {
  try {
    return { ok: true, html: katex.renderToString(expression, EQUATION_KATEX_OPTIONS) };
  } catch (error) {
    const message = error instanceof Error ? error.message : "This equation could not be rendered.";
    return { ok: false, message };
  }
}

export function renderInlineEquation(katex: KatexModule, expression: string): EquationRender {
  try {
    return { ok: true, html: katex.renderToString(expression, INLINE_EQUATION_KATEX_OPTIONS) };
  } catch (error) {
    const message = error instanceof Error ? error.message : "This equation could not be rendered.";
    return { ok: false, message };
  }
}
