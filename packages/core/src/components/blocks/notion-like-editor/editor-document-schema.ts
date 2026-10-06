export type EditorElementRule = {
  type: string;
  attrs: readonly string[];
};

export type EditorMarkRule = {
  type: string;
};

export const EDITOR_ELEMENT_RULES = [
  { type: "p", attrs: ["id"] },
] as const satisfies readonly EditorElementRule[];

export const EDITOR_MARK_RULES: readonly EditorMarkRule[] = [{ type: "bold" }];

const elementAttrs = new Map<string, ReadonlySet<string>>(
  EDITOR_ELEMENT_RULES.map((rule) => [rule.type, new Set<string>(rule.attrs)]),
);

const allowedMarks = new Set<string>(EDITOR_MARK_RULES.map((rule) => rule.type));

export function allowedElementAttrs(type: string): ReadonlySet<string> | undefined {
  return elementAttrs.get(type);
}

export function isAllowedMark(mark: string): boolean {
  return allowedMarks.has(mark);
}
