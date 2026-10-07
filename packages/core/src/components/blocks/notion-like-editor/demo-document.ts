import type { EditorValue } from "./editor-value";

export const DEMO_DOCUMENT_VALUE = [
  {
    type: "h1",
    id: "demo-heading",
    children: [{ text: "Notion-like editor" }],
  },
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
    type: "h2",
    id: "demo-text-styles",
    children: [{ text: "Text styles" }],
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
    id: "demo-code",
    children: [
      { text: "This is " },
      { text: "inline code", code: true },
      { text: ". Press Cmd+E or Ctrl+E." },
    ],
  },
  {
    type: "p",
    id: "demo-superscript",
    children: [
      { text: "This is superscript: x" },
      { text: "2", superscript: true },
      { text: " and E = mc" },
      { text: "2", superscript: true },
      { text: ". Press Cmd+. or Ctrl+." },
    ],
  },
  {
    type: "p",
    id: "demo-subscript",
    children: [
      { text: "This is subscript: H" },
      { text: "2", subscript: true },
      { text: "O. Press Cmd+, or Ctrl+," },
    ],
  },
  {
    type: "p",
    id: "demo-color",
    children: [
      { text: "Text can be " },
      { text: "red", color: "red" },
      { text: ", " },
      { text: "blue", color: "blue" },
      { text: ", or " },
      { text: "green", color: "green" },
      { text: ". Colors come from a preset palette that adapts to light and dark mode." },
    ],
  },
  {
    type: "p",
    id: "demo-highlight",
    children: [
      { text: "This is " },
      { text: "highlighted text", backgroundColor: "yellow" },
      { text: ". Highlights and text colors combine and stay " },
      { text: "readable", color: "blue", backgroundColor: "blue" },
      { text: " in both themes." },
    ],
  },
  {
    type: "p",
    id: "demo-font-size",
    children: [
      { text: "Text comes in sizes from " },
      { text: "small", fontSize: "14px" },
      { text: " to " },
      { text: "large", fontSize: "24px" },
      { text: " and " },
      { text: "extra large", fontSize: "32px" },
      { text: "." },
    ],
  },
  {
    type: "p",
    id: "demo-font-family",
    children: [
      { text: "Text can switch between " },
      { text: "sans", fontFamily: "sans" },
      { text: ", " },
      { text: "serif", fontFamily: "serif" },
      { text: ", and " },
      { text: "mono", fontFamily: "mono" },
      { text: "." },
    ],
  },
  {
    type: "h3",
    id: "demo-block-styles",
    children: [{ text: "Block styles" }],
  },
  {
    type: "p",
    id: "demo-align",
    align: "center",
    children: [
      {
        text: "This paragraph is centered. Blocks can align left, center, right, or justify.",
      },
    ],
  },
  {
    type: "p",
    id: "demo-line-height",
    lineHeight: 2,
    children: [
      {
        text: "This paragraph uses double line height, so its wrapped lines sit further apart than the others. A second line stays in this same block.",
      },
    ],
  },
  {
    type: "p",
    id: "demo-clear",
    children: [
      { text: "Select " },
      { text: "formatted text", bold: true, italic: true, color: "red" },
      { text: " and press Cmd+\\ or Ctrl+\\ to clear it." },
    ],
  },
  {
    type: "h3",
    id: "demo-lists",
    children: [{ text: "Lists" }],
  },
  {
    type: "p",
    id: "demo-bullet-1",
    indent: 1,
    listStyleType: "disc",
    children: [{ text: "Bulleted lists use Tab and Shift+Tab to nest." }],
  },
  {
    type: "p",
    id: "demo-bullet-2",
    indent: 2,
    listStyleType: "disc",
    children: [{ text: "Nested items show a different marker." }],
  },
  {
    type: "p",
    id: "demo-bullet-3",
    indent: 1,
    listStyleType: "disc",
    children: [{ text: "Press Cmd+Shift+8 or Ctrl+Shift+8 to toggle a bullet." }],
  },
  {
    type: "p",
    id: "demo-number-1",
    indent: 1,
    listStyleType: "decimal",
    children: [{ text: "Numbered lists count for you." }],
  },
  {
    type: "p",
    id: "demo-number-2",
    indent: 2,
    listStyleType: "decimal",
    children: [{ text: "Nested steps use letters." }],
  },
  {
    type: "p",
    id: "demo-number-3",
    indent: 1,
    listStyleType: "decimal",
    listStart: 2,
    children: [{ text: "Press Cmd+Shift+7 or Ctrl+Shift+7 to toggle numbering." }],
  },
  {
    type: "p",
    id: "demo-todo-1",
    indent: 1,
    listStyleType: "todo",
    checked: true,
    children: [{ text: "Write the spec." }],
  },
  {
    type: "p",
    id: "demo-todo-2",
    indent: 1,
    listStyleType: "todo",
    checked: false,
    children: [{ text: "Ship the to-do list." }],
  },
  {
    type: "p",
    id: "demo-todo-3",
    indent: 2,
    listStyleType: "todo",
    checked: false,
    children: [{ text: "Nested tasks keep their own state." }],
  },
  {
    type: "p",
    id: "demo-todo-4",
    indent: 1,
    listStyleType: "todo",
    checked: false,
    children: [
      {
        text: "Press Cmd+Shift+9 or Ctrl+Shift+9 to make a to-do, and Cmd+Enter or Ctrl+Enter to check it.",
      },
    ],
  },
  {
    type: "hr",
    id: "demo-divider",
    children: [{ text: "" }],
  },
  {
    type: "h3",
    id: "demo-quotes",
    children: [{ text: "Quotes" }],
  },
  {
    type: "blockquote",
    id: "demo-quote",
    children: [
      {
        type: "p",
        id: "demo-quote-1",
        children: [{ text: "Quotes hold a thought on its own." }],
      },
      {
        type: "p",
        id: "demo-quote-2",
        children: [
          { text: "Press " },
          { text: "Enter", bold: true },
          { text: " for a new line in the quote, and " },
          { text: "Enter", bold: true },
          { text: " on an empty line to leave it." },
        ],
      },
    ],
  },
  {
    type: "h3",
    id: "demo-callouts",
    children: [{ text: "Callouts" }],
  },
  {
    type: "callout",
    id: "demo-callout",
    icon: "lightbulb",
    variant: "info",
    children: [
      {
        type: "p",
        id: "demo-callout-1",
        children: [{ text: "Callouts hold a note with an icon and a color." }],
      },
      {
        type: "p",
        id: "demo-callout-2",
        indent: 1,
        listStyleType: "disc",
        children: [{ text: "Click the icon to change both." }],
      },
    ],
  },
  {
    type: "h3",
    id: "demo-toggles",
    children: [{ text: "Toggles" }],
  },
  {
    type: "toggle",
    id: "demo-toggle",
    children: [
      {
        type: "p",
        id: "demo-toggle-1",
        children: [{ text: "Click the arrow to show what is inside." }],
      },
      {
        type: "p",
        id: "demo-toggle-2",
        children: [{ text: "Toggles hide content until you open them." }],
      },
      {
        type: "p",
        id: "demo-toggle-3",
        indent: 1,
        listStyleType: "disc",
        children: [{ text: "Content stays in the document while hidden." }],
      },
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
