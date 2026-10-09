import type { EditorValue } from "../../lib/document/editor-value";

export const V0_DOCUMENT = [
  {
    type: "p",
    id: "p1",
    children: [{ text: "Hello" }],
  },
] satisfies EditorValue;
