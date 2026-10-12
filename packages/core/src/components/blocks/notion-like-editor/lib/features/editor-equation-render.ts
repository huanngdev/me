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

export type EquationRender = { ok: true; html: string } | { ok: false; message: string };

export function renderEquation(katex: KatexModule, expression: string): EquationRender {
  try {
    return { ok: true, html: katex.renderToString(expression, EQUATION_KATEX_OPTIONS) };
  } catch (error) {
    const message = error instanceof Error ? error.message : "This equation could not be rendered.";
    return { ok: false, message };
  }
}
