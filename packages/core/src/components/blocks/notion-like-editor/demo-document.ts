import type { EditorValue } from "./editor-value";

export const DEMO_DOCUMENT_VALUE = [
  {
    type: "p",
    id: "demo-intro",
    children: [{ text: "This is a paragraph. Click anywhere in it and start typing." }],
  },
  {
    type: "p",
    id: "demo-enter",
    children: [{ text: "Press Enter to start a new paragraph." }],
  },
  {
    type: "p",
    id: "demo-break",
    children: [
      { text: "Press Shift+Enter for a line break.\nThis line is in the same paragraph." },
    ],
  },
  {
    type: "p",
    id: "demo-merge",
    children: [{ text: "Backspace at the start of a paragraph joins it to the one above." }],
  },
  {
    type: "p",
    id: "demo-unicode",
    children: [{ text: "Unicode and emoji stay intact: Tiếng Việt, 日本語, 👩‍💻 👍🏽." }],
  },
  {
    type: "p",
    id: "demo-bold",
    children: [
      { text: "This is " },
      { text: "bold text", bold: true },
      { text: ". Select words and press Cmd+B or Ctrl+B." },
    ],
  },
  {
    type: "p",
    id: "demo-italic",
    children: [
      { text: "This is " },
      { text: "italic text", italic: true },
      { text: ". Press Cmd+I or Ctrl+I, and combine it with bold." },
    ],
  },
  {
    type: "p",
    id: "demo-underline",
    children: [
      { text: "This is " },
      { text: "underlined text", underline: true },
      { text: ". Press Cmd+U or Ctrl+U." },
    ],
  },
  {
    type: "p",
    id: "demo-strikethrough",
    children: [
      { text: "This is " },
      { text: "strikethrough text", strikethrough: true },
      { text: ". Press Cmd+Shift+X or Ctrl+Shift+X." },
    ],
  },
  {
    type: "p",
    id: "demo-paste",
    children: [
      {
        text: "Paste text from anywhere. Each line becomes a paragraph, and formatting this editor does not support yet is removed.",
      },
    ],
  },
  {
    type: "p",
    id: "demo-save",
    children: [
      {
        text: "Your changes save in this browser. Reload the page and they are still here. Undo with Cmd+Z or Ctrl+Z.",
      },
    ],
  },
] satisfies EditorValue;
