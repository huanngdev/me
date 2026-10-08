import type { EditorValue } from "./editor-value";

const wrapped =
  "The lines wrap on purpose, so the space between them is visible in this block. The gap between the lines is the line height.";

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
    type: "toc",
    id: "demo-toc",
    children: [{ text: "" }],
  },
  {
    type: "h2",
    id: "demo-headings",
    children: [{ text: "Headings" }],
  },
  {
    type: "p",
    id: "demo-heading-1",
    children: [
      {
        text: "The title above is a heading 1. Press Cmd+Alt+1 or Ctrl+Alt+1 to toggle it.",
      },
    ],
  },
  {
    type: "h2",
    id: "demo-heading-2",
    children: [{ text: "Heading 2. Press Cmd+Alt+2 or Ctrl+Alt+2." }],
  },
  {
    type: "h3",
    id: "demo-heading-3",
    children: [{ text: "Heading 3. Press Cmd+Alt+3 or Ctrl+Alt+3." }],
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
    id: "demo-combined",
    children: [
      { text: "One phrase can be " },
      {
        text: "bold, italic, underlined, colored, and highlighted",
        bold: true,
        italic: true,
        underline: true,
        color: "red",
        backgroundColor: "yellow",
      },
      { text: " at once." },
    ],
  },
  {
    type: "p",
    id: "demo-color",
    children: [
      { text: "Colors: " },
      { text: "gray", color: "gray" },
      { text: ", " },
      { text: "brown", color: "brown" },
      { text: ", " },
      { text: "orange", color: "orange" },
      { text: ", " },
      { text: "yellow", color: "yellow" },
      { text: ", " },
      { text: "green", color: "green" },
      { text: ", " },
      { text: "blue", color: "blue" },
      { text: ", " },
      { text: "purple", color: "purple" },
      { text: ", " },
      { text: "pink", color: "pink" },
      { text: ", and " },
      { text: "red", color: "red" },
      { text: "." },
    ],
  },
  {
    type: "p",
    id: "demo-highlight",
    children: [
      { text: "Highlights: " },
      { text: "gray", backgroundColor: "gray" },
      { text: ", " },
      { text: "brown", backgroundColor: "brown" },
      { text: ", " },
      { text: "orange", backgroundColor: "orange" },
      { text: ", " },
      { text: "yellow", backgroundColor: "yellow" },
      { text: ", " },
      { text: "green", backgroundColor: "green" },
      { text: ", " },
      { text: "blue", backgroundColor: "blue" },
      { text: ", " },
      { text: "purple", backgroundColor: "purple" },
      { text: ", " },
      { text: "pink", backgroundColor: "pink" },
      { text: ", and " },
      { text: "red", backgroundColor: "red" },
      { text: "." },
    ],
  },
  {
    type: "p",
    id: "demo-font-size",
    children: [
      { text: "Sizes: " },
      { text: "12px", fontSize: "12px" },
      { text: ", " },
      { text: "14px", fontSize: "14px" },
      { text: ", " },
      { text: "16px", fontSize: "16px" },
      { text: ", " },
      { text: "18px", fontSize: "18px" },
      { text: ", " },
      { text: "24px", fontSize: "24px" },
      { text: ", and " },
      { text: "32px", fontSize: "32px" },
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
    id: "demo-block-styles",
    children: [{ text: "Block styles" }],
  },
  {
    type: "p",
    id: "demo-align-left",
    align: "left",
    children: [{ text: "This paragraph is aligned left." }],
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
    id: "demo-align-right",
    align: "right",
    children: [{ text: "This paragraph is aligned right." }],
  },
  {
    type: "p",
    id: "demo-align-justify",
    align: "justify",
    children: [
      {
        text: "This paragraph is justified, so both edges of the wrapped lines line up. It is long enough to wrap: the block stores justify, and the other three alignments are the paragraphs above.",
      },
    ],
  },
  {
    type: "p",
    id: "demo-line-height-1",
    lineHeight: 1,
    children: [{ text: `Line height 1. ${wrapped}` }],
  },
  {
    type: "p",
    id: "demo-line-height-125",
    lineHeight: 1.25,
    children: [{ text: `Line height 1.25. ${wrapped}` }],
  },
  {
    type: "p",
    id: "demo-line-height-15",
    lineHeight: 1.5,
    children: [{ text: `Line height 1.5. ${wrapped}` }],
  },
  {
    type: "p",
    id: "demo-line-height-175",
    lineHeight: 1.75,
    children: [{ text: `Line height 1.75. ${wrapped}` }],
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
    indent: 3,
    listStyleType: "disc",
    children: [
      {
        text: "The third level uses a square. Press Cmd+Shift+8 or Ctrl+Shift+8 to toggle a bullet.",
      },
    ],
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
    indent: 3,
    listStyleType: "decimal",
    children: [
      {
        text: "The third level uses roman numerals. Press Cmd+Shift+7 or Ctrl+Shift+7 to toggle numbering.",
      },
    ],
  },
  {
    type: "p",
    id: "demo-number-restart",
    indent: 1,
    listStyleType: "decimal",
    listRestart: 3,
    listStart: 3,
    children: [{ text: "This numbered run starts at 3." }],
  },
  {
    type: "p",
    id: "demo-number-next",
    indent: 1,
    listStyleType: "decimal",
    listStart: 4,
    children: [{ text: "The next item continues from that start." }],
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
    type: "p",
    id: "demo-bullet-marks",
    indent: 1,
    listStyleType: "disc",
    children: [
      { text: "A bullet can mix " },
      { text: "bold", bold: true },
      { text: ", " },
      { text: "italic", italic: true },
      { text: ", and " },
      { text: "color", color: "purple" },
      { text: "." },
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
      {
        type: "p",
        id: "demo-quote-3",
        indent: 1,
        listStyleType: "disc",
        children: [{ text: "A quote can hold a bullet." }],
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
    id: "demo-callout-default",
    icon: "lightbulb",
    children: [
      {
        type: "p",
        id: "demo-callout-default-text",
        children: [{ text: "Default tone, with the lightbulb." }],
      },
    ],
  },
  {
    type: "callout",
    id: "demo-callout",
    icon: "info",
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
    type: "callout",
    id: "demo-callout-success",
    icon: "circle-check",
    variant: "success",
    children: [
      {
        type: "p",
        id: "demo-callout-success-text",
        children: [{ text: "Success tone, with the circle check." }],
      },
    ],
  },
  {
    type: "callout",
    id: "demo-callout-warning",
    icon: "triangle-alert",
    variant: "warning",
    children: [
      {
        type: "p",
        id: "demo-callout-warning-text",
        children: [{ text: "Warning tone, with the triangle alert." }],
      },
    ],
  },
  {
    type: "callout",
    id: "demo-callout-danger",
    icon: "ban",
    variant: "danger",
    children: [
      {
        type: "p",
        id: "demo-callout-danger-text",
        children: [{ text: "Danger tone, with the ban icon." }],
      },
    ],
  },
  {
    type: "callout",
    id: "demo-callout-todo",
    icon: "pin",
    children: [
      {
        type: "p",
        id: "demo-callout-todo-text",
        children: [{ text: "A callout can hold a to-do." }],
      },
      {
        type: "p",
        id: "demo-callout-todo-item",
        indent: 1,
        listStyleType: "todo",
        checked: false,
        children: [{ text: "Check this inside the callout." }],
      },
    ],
  },
  {
    type: "callout",
    id: "demo-callout-note",
    icon: "notebook-pen",
    children: [
      {
        type: "p",
        id: "demo-callout-note-text",
        children: [{ text: "Take a note." }],
      },
    ],
  },
  {
    type: "callout",
    id: "demo-callout-flame",
    icon: "flame",
    children: [
      {
        type: "p",
        id: "demo-callout-flame-text",
        children: [{ text: "Mark this as urgent." }],
      },
    ],
  },
  {
    type: "callout",
    id: "demo-callout-help",
    icon: "circle-help",
    children: [
      {
        type: "p",
        id: "demo-callout-help-text",
        children: [{ text: "Ask a question." }],
      },
    ],
  },
  {
    type: "callout",
    id: "demo-callout-star",
    icon: "star",
    children: [
      {
        type: "p",
        id: "demo-callout-star-text",
        children: [{ text: "Save a favorite." }],
      },
    ],
  },
  {
    type: "callout",
    id: "demo-callout-target",
    icon: "target",
    children: [
      {
        type: "p",
        id: "demo-callout-target-text",
        children: [{ text: "Name the goal." }],
      },
    ],
  },
  {
    type: "callout",
    id: "demo-callout-message",
    icon: "message-circle",
    children: [
      {
        type: "p",
        id: "demo-callout-message-text",
        children: [{ text: "Leave a comment." }],
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
    type: "toggle",
    id: "demo-toggle-nest",
    children: [
      {
        type: "p",
        id: "demo-toggle-nest-label",
        children: [{ text: "Outer toggle. Three levels is the cap." }],
      },
      {
        type: "p",
        id: "demo-toggle-nest-body",
        children: [{ text: "This line sits in the outer toggle." }],
      },
      {
        type: "toggle",
        id: "demo-toggle-nest-2",
        children: [
          {
            type: "p",
            id: "demo-toggle-nest-2-label",
            children: [{ text: "Middle toggle." }],
          },
          {
            type: "p",
            id: "demo-toggle-nest-2-body",
            children: [{ text: "This line sits in the middle toggle." }],
          },
          {
            type: "toggle",
            id: "demo-toggle-nest-3",
            children: [
              {
                type: "p",
                id: "demo-toggle-nest-3-label",
                children: [{ text: "Inner toggle." }],
              },
              {
                type: "p",
                id: "demo-toggle-nest-3-body",
                children: [{ text: "This line sits in the inner toggle." }],
              },
            ],
          },
        ],
      },
    ],
  },
  {
    type: "toggle",
    id: "demo-toggle-quote",
    children: [
      {
        type: "p",
        id: "demo-toggle-quote-label",
        children: [{ text: "A toggle can hold a quote." }],
      },
      {
        type: "blockquote",
        id: "demo-toggle-quote-body",
        children: [
          {
            type: "p",
            id: "demo-toggle-quote-text",
            children: [{ text: "This quote sits inside the toggle." }],
          },
        ],
      },
    ],
  },
  {
    type: "toggle",
    id: "demo-toggle-heading",
    children: [
      {
        type: "h2",
        id: "demo-toggle-heading-label",
        children: [{ text: "A toggle heading folds a whole section." }],
      },
      {
        type: "p",
        id: "demo-toggle-heading-body",
        children: [{ text: "The section stays in the document while the heading is closed." }],
      },
      {
        type: "p",
        id: "demo-toggle-heading-item",
        indent: 1,
        listStyleType: "disc",
        children: [{ text: "Open it to read the section." }],
      },
    ],
  },
  {
    type: "h3",
    id: "demo-code-heading",
    children: [{ text: "Code" }],
  },
  {
    type: "code_block",
    id: "demo-code-ts",
    lang: "typescript",
    children: [
      {
        type: "code_line",
        id: "demo-code-ts-1",
        children: [{ text: "const note = {" }],
      },
      {
        type: "code_line",
        id: "demo-code-ts-2",
        children: [{ text: '  id: "note-1",' }],
      },
      {
        type: "code_line",
        id: "demo-code-ts-3",
        children: [{ text: '  title: "Editor",' }],
      },
      {
        type: "code_line",
        id: "demo-code-ts-4",
        children: [{ text: '  tags: ["typescript"],' }],
      },
      {
        type: "code_line",
        id: "demo-code-ts-5",
        children: [{ text: "  published: true," }],
      },
      {
        type: "code_line",
        id: "demo-code-ts-6",
        children: [{ text: "};" }],
      },
    ],
  },
  {
    type: "code_block",
    id: "demo-code-json",
    lang: "json",
    children: [
      {
        type: "code_line",
        id: "demo-code-json-1",
        children: [{ text: "{" }],
      },
      {
        type: "code_line",
        id: "demo-code-json-2",
        children: [{ text: '  "id": "note-1",' }],
      },
      {
        type: "code_line",
        id: "demo-code-json-3",
        children: [{ text: '  "title": "Editor"' }],
      },
      {
        type: "code_line",
        id: "demo-code-json-4",
        children: [{ text: "}" }],
      },
    ],
  },
  {
    type: "h3",
    id: "demo-tables",
    children: [{ text: "Tables" }],
  },
  {
    type: "table",
    id: "demo-table",
    children: [
      {
        type: "tr",
        id: "demo-table-r1",
        children: [
          {
            type: "th",
            id: "demo-table-r1c1",
            children: [{ type: "p", id: "demo-table-r1c1p", children: [{ text: "Block" }] }],
          },
          {
            type: "th",
            id: "demo-table-r1c2",
            children: [{ type: "p", id: "demo-table-r1c2p", children: [{ text: "Shortcut" }] }],
          },
          {
            type: "th",
            id: "demo-table-r1c3",
            children: [{ type: "p", id: "demo-table-r1c3p", children: [{ text: "Notes" }] }],
          },
        ],
      },
      {
        type: "tr",
        id: "demo-table-r2",
        children: [
          {
            type: "td",
            id: "demo-table-r2c1",
            children: [{ type: "p", id: "demo-table-r2c1p", children: [{ text: "Bold" }] }],
          },
          {
            type: "td",
            id: "demo-table-r2c2",
            children: [{ type: "p", id: "demo-table-r2c2p", children: [{ text: "Mod+B" }] }],
          },
          {
            type: "td",
            id: "demo-table-r2c3",
            children: [
              {
                type: "p",
                id: "demo-table-r2c3p",
                children: [{ text: "Bold", bold: true }, { text: " toggles on the selection." }],
              },
            ],
          },
        ],
      },
      {
        type: "tr",
        id: "demo-table-r3",
        children: [
          {
            type: "td",
            id: "demo-table-r3c1",
            children: [{ type: "p", id: "demo-table-r3c1p", children: [{ text: "Heading" }] }],
          },
          {
            type: "td",
            id: "demo-table-r3c2",
            children: [{ type: "p", id: "demo-table-r3c2p", children: [{ text: "Mod+Alt+1" }] }],
          },
          {
            type: "td",
            id: "demo-table-r3c3",
            children: [
              {
                type: "p",
                id: "demo-table-r3c3p",
                children: [{ text: "Heading 1 is the page title block." }],
              },
            ],
          },
        ],
      },
    ],
  },
  {
    type: "table",
    id: "demo-release",
    colSizes: [160, 240, 120],
    children: [
      {
        type: "tr",
        id: "demo-release-r1",
        children: [
          {
            type: "th",
            id: "demo-release-plan",
            colSpan: 2,
            children: [
              { type: "p", id: "demo-release-plan-p", children: [{ text: "Release plan" }] },
            ],
          },
          {
            type: "th",
            id: "demo-release-status",
            children: [{ type: "p", id: "demo-release-status-p", children: [{ text: "Status" }] }],
          },
        ],
      },
      {
        type: "tr",
        id: "demo-release-r2",
        children: [
          {
            type: "td",
            id: "demo-release-editor",
            rowSpan: 2,
            children: [{ type: "p", id: "demo-release-editor-p", children: [{ text: "Editor" }] }],
          },
          {
            type: "td",
            id: "demo-release-merge",
            children: [{ type: "p", id: "demo-release-merge-p", children: [{ text: "Merge" }] }],
          },
          {
            type: "td",
            id: "demo-release-now",
            children: [{ type: "p", id: "demo-release-now-p", children: [{ text: "Now" }] }],
          },
        ],
      },
      {
        type: "tr",
        id: "demo-release-r3",
        children: [
          {
            type: "td",
            id: "demo-release-split",
            children: [{ type: "p", id: "demo-release-split-p", children: [{ text: "Split" }] }],
          },
          {
            type: "td",
            id: "demo-release-next",
            children: [{ type: "p", id: "demo-release-next-p", children: [{ text: "Next" }] }],
          },
        ],
      },
    ],
  },
  {
    type: "h3",
    id: "demo-images",
    children: [{ text: "Media and files" }],
  },
  {
    type: "img",
    id: "demo-image",
    url: "/blocks/notion-like-editor/image-demo.svg",
    naturalWidth: 640,
    naturalHeight: 400,
    alt: "A small window looking onto a violet hill and a pale sun",
    caption: [{ text: "A drawing stored with the block, not an uploaded file." }],
    children: [{ text: "" }],
  },
  {
    type: "video",
    id: "demo-video",
    url: "/blocks/notion-like-editor/video-demo.webm",
    mimeType: "video/webm",
    naturalWidth: 160,
    naturalHeight: 90,
    durationMs: 1000,
    caption: [{ text: "A one-second drawing, recorded in the browser." }],
    children: [{ text: "" }],
  },
  {
    type: "audio",
    id: "demo-audio",
    url: "/blocks/notion-like-editor/audio-demo.wav",
    mimeType: "audio/wav",
    name: "audio-demo.wav",
    durationMs: 1000,
    caption: [{ text: "A one-second tone, written into a WAV file." }],
    children: [{ text: "" }],
  },
  {
    type: "file",
    id: "demo-file",
    url: "/blocks/notion-like-editor/file-demo.txt",
    mimeType: "application/octet-stream",
    name: "file-demo.txt",
    byteSize: 73,
    caption: [{ text: "A text file stored with the block." }],
    children: [{ text: "" }],
  },
  {
    type: "file",
    id: "demo-pdf",
    url: "/blocks/notion-like-editor/pdf-demo.pdf",
    mimeType: "application/pdf",
    name: "pdf-demo.pdf",
    byteSize: 591,
    caption: [{ text: "A one-page PDF. Paste a PDF to preview it." }],
    children: [{ text: "" }],
  },
  {
    type: "media_embed",
    id: "demo-embed",
    provider: "youtube",
    videoId: "jNQXAC9IVRw",
    sourceUrl: "https://www.youtube.com/watch?v=jNQXAC9IVRw",
    caption: [{ text: "Me at the zoo, the first video uploaded to YouTube." }],
    children: [{ text: "" }],
  },
  {
    type: "bookmark",
    id: "demo-bookmark",
    url: "https://platejs.org/docs",
    title: "Plate",
    description: "The rich-text editor framework for React.",
    siteName: "Plate",
    imageUrl: "/blocks/notion-like-editor/bookmark-demo.svg",
    fetchedAt: "2026-10-08T00:00:00.000Z",
    children: [{ text: "" }],
  },
  {
    type: "bookmark",
    id: "demo-bookmark-fallback",
    url: "https://example.com/not-in-the-preview-list",
    children: [{ text: "" }],
  },
  {
    type: "h3",
    id: "demo-columns",
    children: [{ text: "Columns" }],
  },
  {
    type: "column_group",
    id: "demo-column-group",
    children: [
      {
        type: "column",
        id: "demo-column-list",
        width: "50%",
        children: [
          {
            type: "p",
            id: "demo-column-item",
            indent: 1,
            listStyleType: "disc",
            children: [{ text: "A list can sit in one column." }],
          },
        ],
      },
      {
        type: "column",
        id: "demo-column-note",
        width: "50%",
        children: [
          {
            type: "callout",
            id: "demo-column-callout",
            icon: "info",
            variant: "info",
            children: [
              {
                type: "p",
                id: "demo-column-callout-text",
                children: [{ text: "A callout can sit in the other." }],
              },
            ],
          },
        ],
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

// The id is the content. A changed demo gets a new storage key, so an older
// edit cannot hide the current showcase. Edits to this content keep this id.
function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function demoDocumentId(value: EditorValue): string {
  return `demo-${fnv1a(JSON.stringify(value))}`;
}

export const DEMO_DOCUMENT_ID = demoDocumentId(DEMO_DOCUMENT_VALUE);
