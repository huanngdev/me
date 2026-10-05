import type { Value } from "platejs";

export type EditorValue = Value;

export const EMPTY_EDITOR_VALUE = [
  {
    type: "p",
    children: [{ text: "" }],
  },
] satisfies EditorValue;
