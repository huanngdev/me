export type FeatureKind = "block" | "inline" | "mark" | "block-attribute" | "ux";

export type FeatureEntryVia =
  "slash" | "toolbar" | "block-menu" | "shortcut" | "input-rule" | "paste" | "pointer" | "host";

export type FeatureEntryPoint = {
  via: FeatureEntryVia;
  id?: string;
  keys?: string;
  note?: string;
};

export type FeatureStatic = "rendered" | "not-applicable";

export type FeatureEntry = {
  key: string;
  kind: FeatureKind;
  label: string;
  entry: readonly FeatureEntryPoint[];
  static: FeatureStatic;
  demoBlockId?: string;
  limits: readonly string[];
};

// Slash item id to the label the slash menu shows. The inventory test checks each one against the live menu.
export const SLASH_ITEM_LABELS: Readonly<Partial<Record<string, string>>> = {
  paragraph: "Text",
  h1: "Heading 1",
  h2: "Heading 2",
  h3: "Heading 3",
  bulleted: "Bulleted list",
  numbered: "Numbered list",
  todo: "To-do list",
  toggle: "Toggle",
  "toggle-h1": "Toggle heading 1",
  "toggle-h2": "Toggle heading 2",
  "toggle-h3": "Toggle heading 3",
  quote: "Quote",
  callout: "Callout",
  code: "Code",
  divider: "Divider",
  equation: "Equation",
  toc: "Table of contents",
  table: "Table",
  columns: "Columns",
  bookmark: "Bookmark",
  image: "Image",
  file: "File",
  "page-link": "Page link",
  mention: "Mention",
  link: "Link",
  footnote: "Footnote",
};

export const FEATURE_INVENTORY: readonly FeatureEntry[] = [
  // Blocks
  {
    key: "p",
    kind: "block",
    label: "Paragraph",
    entry: [
      { via: "slash", id: "paragraph" },
      { via: "shortcut", keys: "Mod+Alt+0" },
      { via: "shortcut", keys: "Mod+Shift+0" },
    ],
    static: "rendered",
    demoBlockId: "demo-intro",
    limits: [],
  },
  {
    key: "h1",
    kind: "block",
    label: "Heading 1",
    entry: [
      { via: "slash", id: "h1" },
      { via: "shortcut", keys: "Mod+Alt+1" },
      { via: "input-rule", note: "# + space" },
    ],
    static: "rendered",
    demoBlockId: "demo-heading",
    limits: ["Headings take no line height"],
  },
  {
    key: "h2",
    kind: "block",
    label: "Heading 2",
    entry: [
      { via: "slash", id: "h2" },
      { via: "shortcut", keys: "Mod+Alt+2" },
      { via: "input-rule", note: "## + space" },
    ],
    static: "rendered",
    demoBlockId: "demo-headings",
    limits: ["Headings take no line height"],
  },
  {
    key: "h3",
    kind: "block",
    label: "Heading 3",
    entry: [
      { via: "slash", id: "h3" },
      { via: "shortcut", keys: "Mod+Alt+3" },
      { via: "input-rule", note: "### + space" },
    ],
    static: "rendered",
    demoBlockId: "demo-block-styles",
    limits: ["Headings take no line height"],
  },
  {
    key: "blockquote",
    kind: "block",
    label: "Quote",
    entry: [
      { via: "slash", id: "quote" },
      { via: "block-menu", id: "block.turn-into.blockquote", note: "Quote" },
      { via: "input-rule", note: "> + space" },
    ],
    static: "rendered",
    demoBlockId: "demo-quote",
    limits: ["Children are paragraphs only"],
  },
  {
    key: "hr",
    kind: "block",
    label: "Divider",
    entry: [
      { via: "slash", id: "divider" },
      { via: "input-rule", note: "---" },
    ],
    static: "rendered",
    demoBlockId: "demo-divider",
    limits: ["Stores only its id, with no alignment or indent"],
  },
  {
    key: "bookmark",
    kind: "block",
    label: "Bookmark",
    entry: [
      { via: "slash", id: "bookmark" },
      { via: "paste", note: "Bookmark in the link paste menu" },
      { via: "host", note: "LinkPreviewAdapter fills the preview" },
    ],
    static: "rendered",
    demoBlockId: "demo-bookmark",
    limits: [
      "Only http and https links",
      "Link up to 2048 characters",
      "Title up to 300, description up to 500, site name up to 100 characters",
      "Without a LinkPreviewAdapter the card shows the domain",
    ],
  },
  {
    key: "image",
    kind: "block",
    label: "Image",
    entry: [
      { via: "slash", id: "image" },
      { via: "paste", note: "Image files pasted or dropped, with other files, up to 10 at a time" },
      { via: "pointer", note: "Click for actions, drag the edge handles to resize" },
      { via: "toolbar", id: "block.image.align", note: "Align left, center and right" },
      { via: "toolbar", id: "block.image.caption", note: "Caption" },
      { via: "toolbar", id: "block.image.set-source", note: "Replace" },
      { via: "toolbar", id: "block.image.remove", note: "Delete" },
      { via: "host", note: "A file adapter stores picked and pasted files" },
    ],
    static: "rendered",
    demoBlockId: "demo-image",
    limits: [
      "Embed links are http or https only",
      "Width is 10 to 100 percent of the column, or the natural size",
      "Mime type must start with image/",
      "Caption up to 500 characters",
      "Without a file adapter, only http, https and root-relative urls show an image",
      "Arrow keys resize by 5, or by 1 with Shift; Home and End set 10 and 100",
    ],
  },
  {
    key: "file",
    kind: "block",
    label: "File",
    entry: [
      { via: "slash", id: "file" },
      { via: "paste", note: "Files pasted or dropped, other than images, up to 10 at a time" },
      { via: "pointer", note: "Click for actions: Download, Rename, Replace and Delete" },
      { via: "toolbar", id: "block.file.rename", note: "Rename" },
      { via: "toolbar", id: "block.file.set-source", note: "Replace" },
      { via: "toolbar", id: "block.file.remove", note: "Delete" },
      { via: "host", note: "A file adapter stores picked and pasted files" },
    ],
    static: "rendered",
    demoBlockId: "demo-file",
    limits: [
      "Links are http or https only",
      "Name up to 255 characters; a link without a name takes its name from the url",
      "Any mime type; the icon follows the mime type, then the extension",
      "Without a file adapter, only http, https and root-relative urls open",
    ],
  },
  {
    key: "page_link",
    kind: "block",
    label: "Page link",
    entry: [
      { via: "slash", id: "page-link" },
      { via: "host", note: "onOpenPage receives the page id and kind" },
    ],
    static: "rendered",
    demoBlockId: "demo-page-link-roadmap",
    limits: [
      "The slash item is offered only with a PageProvider",
      "Title up to 200 characters",
      "Static output has no link",
    ],
  },
  {
    key: "toc",
    kind: "block",
    label: "Table of contents",
    entry: [
      { via: "slash", id: "toc" },
      { via: "toolbar", id: "block.toc.set-depth", note: "Table of contents depth" },
    ],
    static: "rendered",
    demoBlockId: "demo-toc",
    limits: ["Depth 1 to 3, default 3"],
  },
  {
    key: "equation",
    kind: "block",
    label: "Equation",
    entry: [{ via: "slash", id: "equation" }],
    static: "rendered",
    demoBlockId: "demo-equation-quadratic",
    limits: [
      "Expression up to 4000 characters",
      "Control characters other than tab and newline are refused",
      "Rendered with KaTeX",
    ],
  },
  {
    key: "synced_ref",
    kind: "block",
    label: "Synced reference",
    entry: [
      {
        via: "pointer",
        note: "Go to original, Convert to copy, Delete",
      },
    ],
    static: "rendered",
    demoBlockId: "demo-synced-ref",
    limits: ["No menu item creates a reference yet", "Target id up to 200 characters"],
  },
  {
    key: "callout",
    kind: "block",
    label: "Callout",
    entry: [
      { via: "slash", id: "callout" },
      { via: "block-menu", id: "block.turn-into.callout", note: "Callout" },
      { via: "toolbar", id: "format.callout-icon", note: "Callout icon" },
      { via: "toolbar", id: "format.callout-tone", note: "Callout tone" },
    ],
    static: "rendered",
    demoBlockId: "demo-callout",
    limits: [
      "Children are paragraphs only",
      "12 Lucide icons, with no emoji icons",
      "Four tones: info, success, warning, danger",
    ],
  },
  {
    key: "toggle",
    kind: "block",
    label: "Toggle",
    entry: [
      { via: "slash", id: "toggle" },
      { via: "slash", id: "toggle-h1" },
      { via: "slash", id: "toggle-h2" },
      { via: "slash", id: "toggle-h3" },
      { via: "block-menu", id: "block.turn-into.toggle", note: "Toggle" },
    ],
    static: "rendered",
    demoBlockId: "demo-toggle",
    limits: [
      "Nests up to 3 levels",
      "The first child is a paragraph or a heading from 1 to 3",
      "A list item cannot be the first child",
    ],
  },
  {
    key: "code_block",
    kind: "block",
    label: "Code block",
    entry: [
      { via: "slash", id: "code" },
      { via: "block-menu", id: "block.turn-into.code-block", note: "Code" },
      { via: "input-rule", note: "``` + space" },
      { via: "toolbar", id: "format.code-language", note: "Code language" },
      { via: "shortcut", keys: "Mod+Enter", note: "Exits the code block" },
    ],
    static: "rendered",
    demoBlockId: "demo-code-ts",
    limits: [
      "15 stored languages, plus plain text",
      "An unknown language falls back to plain text",
    ],
  },
  {
    key: "code_line",
    kind: "block",
    label: "Code line",
    entry: [{ via: "slash", id: "code", note: "Each line of a code block" }],
    static: "rendered",
    demoBlockId: "demo-code-ts-1",
    limits: ["Each line is its own block", "Indent is refused on code lines"],
  },
  {
    key: "table",
    kind: "block",
    label: "Table",
    entry: [
      { via: "slash", id: "table" },
      { via: "toolbar", id: "block.table.insert-row", note: "Table options" },
    ],
    static: "rendered",
    demoBlockId: "demo-table",
    limits: [
      "Up to 50 rows and 20 columns",
      "A slash-inserted table is 3 by 3",
      "A table cannot sit inside a table",
      "Cells hold paragraphs only",
    ],
  },
  {
    key: "tr",
    kind: "block",
    label: "Table row",
    entry: [{ via: "toolbar", id: "block.table.insert-row", note: "Insert row" }],
    static: "rendered",
    demoBlockId: "demo-table",
    limits: ["Up to 20 cells per row"],
  },
  {
    key: "td",
    kind: "block",
    label: "Table cell",
    entry: [{ via: "pointer", note: "Click a cell to type in it" }],
    static: "rendered",
    demoBlockId: "demo-table-r2c1",
    limits: ["Holds paragraphs only"],
  },
  {
    key: "th",
    kind: "block",
    label: "Table header cell",
    entry: [{ via: "toolbar", id: "block.table.header-row", note: "Header row" }],
    static: "rendered",
    demoBlockId: "demo-table-r1c1",
    limits: ["Holds paragraphs only"],
  },
  {
    key: "column_group",
    kind: "block",
    label: "Columns",
    entry: [
      { via: "slash", id: "columns" },
      { via: "block-menu", id: "block.columns.set-count", note: "Columns" },
    ],
    static: "rendered",
    demoBlockId: "demo-column-group",
    limits: ["2 or 3 columns", "Top level only"],
  },
  {
    key: "column",
    kind: "block",
    label: "Column",
    entry: [{ via: "toolbar", id: "block.columns.set-widths", note: "Column widths" }],
    static: "rendered",
    demoBlockId: "demo-column-list",
    limits: ["Width is stored as a percentage", "Cannot hold another column group"],
  },
  {
    key: "footnote_def",
    kind: "block",
    label: "Footnote definition",
    entry: [
      { via: "shortcut", keys: "Mod+Enter", note: "In a definition, jumps to its first reference" },
      { via: "pointer", note: "Edit the text in place" },
    ],
    static: "rendered",
    demoBlockId: "demo-footnote-def",
    limits: [
      "Top level only",
      "A definition moved elsewhere becomes a paragraph",
      "No Turn into or Color in the block menu",
    ],
  },
  // Inline
  {
    key: "a",
    kind: "inline",
    label: "Link",
    entry: [
      { via: "slash", id: "link" },
      { via: "shortcut", keys: "Mod+K", note: "Opens the link popover" },
      { via: "toolbar", id: "inline.link.insert", note: "Link" },
      { via: "input-rule", note: "URL + space or Enter" },
      { via: "paste", note: "Apply pasted link" },
    ],
    static: "rendered",
    demoBlockId: "demo-link-site",
    limits: [
      "Schemes are http, https, mailto and tel, plus relative and hash URLs",
      "Link up to 2048 characters",
      "target and rel are not stored",
    ],
  },
  {
    key: "mention",
    kind: "inline",
    label: "Mention",
    entry: [
      { via: "slash", id: "mention" },
      { via: "input-rule", note: "@ then a name" },
      { via: "host", note: "MentionProvider searches and resolves people" },
    ],
    static: "rendered",
    demoBlockId: "demo-mention-alex",
    limits: [
      "Label up to 120 characters",
      "Identity is entityType and entityId",
      "Without a MentionProvider the trigger does nothing",
    ],
  },
  {
    key: "inline_equation",
    kind: "inline",
    label: "Inline equation",
    entry: [
      { via: "toolbar", id: "inline.equation", note: "Equation" },
      { via: "shortcut", keys: "Mod+Shift+E", note: "Inserts or wraps an equation" },
    ],
    static: "rendered",
    demoBlockId: "demo-inline-equation",
    limits: ["Expression up to 4000 characters", "Not inside links, voids or code"],
  },
  {
    key: "date",
    kind: "inline",
    label: "Inline date",
    entry: [
      { via: "shortcut", keys: "Mod+;", note: "Inserts today" },
      { via: "pointer", note: "Click a date to set or remove it" },
    ],
    static: "rendered",
    demoBlockId: "demo-inline-date",
    limits: ["Calendar dates only, stored as YYYY-MM-DD", "Not inside links, voids or code"],
  },
  {
    key: "footnote_ref",
    kind: "inline",
    label: "Footnote reference",
    entry: [
      { via: "slash", id: "footnote" },
      { via: "pointer", note: "Click a reference to see its definition" },
    ],
    static: "rendered",
    demoBlockId: "demo-footnote-ref",
    limits: [
      "The number is derived from document order and not stored",
      "A reference cannot sit inside a definition",
      "A sup element in pasted HTML stays plain text",
    ],
  },
  // Text styles
  {
    key: "bold",
    kind: "mark",
    label: "Bold",
    entry: [
      { via: "shortcut", keys: "Mod+B" },
      { via: "toolbar", id: "format.bold", note: "Bold" },
      { via: "input-rule", note: "two asterisks around text" },
    ],
    static: "rendered",
    demoBlockId: "demo-bold",
    limits: [],
  },
  {
    key: "italic",
    kind: "mark",
    label: "Italic",
    entry: [
      { via: "shortcut", keys: "Mod+I" },
      { via: "toolbar", id: "format.italic", note: "Italic" },
      { via: "input-rule", note: "one asterisk or underscore around text" },
    ],
    static: "rendered",
    demoBlockId: "demo-italic",
    limits: [],
  },
  {
    key: "underline",
    kind: "mark",
    label: "Underline",
    entry: [
      { via: "shortcut", keys: "Mod+U" },
      { via: "toolbar", id: "format.underline", note: "Underline" },
    ],
    static: "rendered",
    demoBlockId: "demo-underline",
    limits: [],
  },
  {
    key: "strikethrough",
    kind: "mark",
    label: "Strikethrough",
    entry: [
      { via: "shortcut", keys: "Mod+Shift+X" },
      { via: "toolbar", id: "format.strikethrough", note: "Strikethrough" },
      { via: "input-rule", note: "two tildes around text" },
    ],
    static: "rendered",
    demoBlockId: "demo-strikethrough",
    limits: [],
  },
  {
    key: "code",
    kind: "mark",
    label: "Inline code",
    entry: [
      { via: "shortcut", keys: "Mod+E" },
      { via: "toolbar", id: "format.code", note: "Code" },
      { via: "input-rule", note: "backtick around text" },
    ],
    static: "rendered",
    demoBlockId: "demo-code",
    limits: ["Code text is always monospace"],
  },
  {
    key: "superscript",
    kind: "mark",
    label: "Superscript",
    entry: [
      { via: "shortcut", keys: "Mod+." },
      { via: "toolbar", id: "format.superscript", note: "Superscript" },
    ],
    static: "rendered",
    demoBlockId: "demo-superscript",
    limits: [],
  },
  {
    key: "subscript",
    kind: "mark",
    label: "Subscript",
    entry: [
      { via: "shortcut", keys: "Mod+," },
      { via: "toolbar", id: "format.subscript", note: "Subscript" },
    ],
    static: "rendered",
    demoBlockId: "demo-subscript",
    limits: [],
  },
  {
    key: "kbd",
    kind: "mark",
    label: "Keyboard",
    entry: [{ via: "toolbar", id: "format.kbd", note: "Keyboard" }],
    static: "rendered",
    demoBlockId: "demo-kbd",
    limits: ["Set from the More menu only, with no shortcut"],
  },
  {
    key: "color",
    kind: "mark",
    label: "Text color",
    entry: [{ via: "toolbar", id: "format.text-color", note: "Text color" }],
    static: "rendered",
    demoBlockId: "demo-color",
    limits: ["9 palette tokens, with no custom colors"],
  },
  {
    key: "backgroundColor",
    kind: "mark",
    label: "Highlight",
    entry: [{ via: "toolbar", id: "format.highlight", note: "Highlight" }],
    static: "rendered",
    demoBlockId: "demo-highlight",
    limits: ["9 palette tokens, with no custom colors"],
  },
  {
    key: "fontSize",
    kind: "mark",
    label: "Font size",
    entry: [{ via: "toolbar", id: "format.font-size", note: "Font size" }],
    static: "rendered",
    demoBlockId: "demo-font-size",
    limits: ["6 presets from 12px to 32px"],
  },
  {
    key: "fontFamily",
    kind: "mark",
    label: "Font family",
    entry: [{ via: "toolbar", id: "format.font-family", note: "Font family" }],
    static: "rendered",
    demoBlockId: "demo-font-family",
    limits: ["3 families: sans, serif and mono"],
  },
  // Block attributes
  {
    key: "align",
    kind: "block-attribute",
    label: "Text align",
    entry: [{ via: "toolbar", id: "format.align", note: "Align" }],
    static: "rendered",
    demoBlockId: "demo-align",
    limits: ["4 values: left, center, right and justify", "Paragraphs and headings only"],
  },
  {
    key: "lineHeight",
    kind: "block-attribute",
    label: "Line height",
    entry: [{ via: "toolbar", id: "format.line-height", note: "Line height" }],
    static: "rendered",
    demoBlockId: "demo-line-height",
    limits: ["5 values from 1 to 2", "Paragraphs only"],
  },
  {
    key: "indent",
    kind: "block-attribute",
    label: "Indent",
    entry: [
      { via: "shortcut", keys: "Mod+]", note: "Indent" },
      { via: "shortcut", keys: "Mod+[", note: "Outdent" },
      { via: "shortcut", keys: "Tab", note: "In a list" },
      { via: "toolbar", id: "block.indent", note: "Indent" },
    ],
    static: "rendered",
    demoBlockId: "demo-indent",
    limits: ["6 levels", "A list uses the same value as its depth"],
  },
  {
    key: "listStyleType",
    kind: "block-attribute",
    label: "Lists",
    entry: [
      { via: "slash", id: "bulleted" },
      { via: "slash", id: "numbered" },
      { via: "slash", id: "todo" },
      { via: "shortcut", keys: "Mod+Shift+8", note: "Bulleted list" },
      { via: "shortcut", keys: "Mod+Shift+7", note: "Numbered list" },
      { via: "shortcut", keys: "Mod+Shift+9", note: "To-do list" },
      { via: "input-rule", note: "- + space" },
      { via: "input-rule", note: "1. + space" },
      { via: "input-rule", note: "[] + space" },
    ],
    static: "rendered",
    demoBlockId: "demo-bullet-1",
    limits: ["3 styles: disc, decimal and todo"],
  },
  {
    key: "listRestart",
    kind: "block-attribute",
    label: "Restart numbering",
    entry: [{ via: "input-rule", note: "N. + space, with N above 1" }],
    static: "rendered",
    demoBlockId: "demo-number-restart",
    limits: ["Numbers from 1 to 9999", "Decimal items only", "No menu or toolbar control sets it"],
  },
  {
    key: "checked",
    kind: "block-attribute",
    label: "To-do checked",
    entry: [{ via: "shortcut", keys: "Mod+Enter", note: "Checks the to-do" }],
    static: "rendered",
    demoBlockId: "demo-todo-2",
    limits: ["Stored on to-do items only"],
  },
  {
    key: "textTone",
    kind: "block-attribute",
    label: "Text tone",
    entry: [{ via: "block-menu", id: "block.tone", note: "Color, Text" }],
    static: "rendered",
    limits: ["Palette tokens only", "Not stored on callouts or toggles"],
  },
  {
    key: "backgroundTone",
    kind: "block-attribute",
    label: "Background tone",
    entry: [{ via: "block-menu", id: "block.tone", note: "Color, Background" }],
    static: "rendered",
    demoBlockId: "demo-block-color",
    limits: ["Palette tokens only", "Not stored on callouts or toggles"],
  },
  // Editing experience
  {
    key: "ux:find",
    kind: "ux",
    label: "Find and replace",
    entry: [{ via: "shortcut", keys: "Mod+F", note: "Opens find" }],
    static: "not-applicable",
    limits: [
      "Query up to 200 characters",
      "Counts stop at 1000 matches",
      "Replacement up to 1000 characters",
    ],
  },
  {
    key: "ux:slash-menu",
    kind: "ux",
    label: "Slash menu",
    entry: [{ via: "input-rule", note: "/ after a boundary" }],
    static: "not-applicable",
    limits: ["Query up to 40 characters"],
  },
  {
    key: "ux:block-menu",
    kind: "ux",
    label: "Block menu",
    entry: [
      { via: "shortcut", keys: "Mod+/", note: "Opens the block menu" },
      { via: "pointer", note: "Click the grip" },
    ],
    static: "not-applicable",
    limits: ["A footnote definition has no Turn into or Color"],
  },
  {
    key: "ux:block-handle",
    kind: "ux",
    label: "Block handle",
    entry: [{ via: "pointer", note: "Hover a block to show its grip and Add block below" }],
    static: "not-applicable",
    limits: ["Not shown in read-only mode"],
  },
  {
    key: "ux:block-drag",
    kind: "ux",
    label: "Drag and drop",
    entry: [{ via: "pointer", note: "Drag the grip to move a block" }],
    static: "not-applicable",
    limits: [],
  },
  {
    key: "ux:block-selection",
    kind: "ux",
    label: "Block selection",
    entry: [
      { via: "shortcut", keys: "Mod+A", note: "Selects the block text, then all blocks" },
      { via: "shortcut", keys: "Mod+D", note: "With blocks selected, duplicates them" },
      {
        via: "shortcut",
        keys: "Mod+Shift+Alt+ArrowUp",
        note: "With blocks selected, moves them up",
      },
      {
        via: "shortcut",
        keys: "Mod+Shift+Alt+ArrowDown",
        note: "With blocks selected, moves them down",
      },
    ],
    static: "not-applicable",
    limits: [],
  },
  {
    key: "ux:history",
    kind: "ux",
    label: "Undo and redo",
    entry: [
      { via: "shortcut", keys: "Mod+Z", note: "Undo" },
      { via: "shortcut", keys: "Mod+Shift+Z", note: "Redo" },
    ],
    static: "not-applicable",
    limits: ["No undo depth limit is configured"],
  },
  {
    key: "ux:clear-formatting",
    kind: "ux",
    label: "Clear formatting",
    entry: [
      { via: "shortcut", keys: "Mod+\\", note: "Clear formatting" },
      { via: "toolbar", id: "format.clear", note: "Clear formatting" },
    ],
    static: "not-applicable",
    limits: ["Removes inline marks only", "Block attributes stay"],
  },
  {
    key: "ux:paste",
    kind: "ux",
    label: "Paste",
    entry: [{ via: "paste", note: "HTML, plain text and pasted links" }],
    static: "not-applicable",
    limits: [
      "Up to 2000 blocks and 1000000 text characters per paste",
      "HTML over 2000000 characters is dropped and plain text is used",
      "Files are stored with a file adapter, up to 10 per paste or drop; other media is not stored",
    ],
  },
  {
    key: "ux:emoji",
    kind: "ux",
    label: "Emoji suggestions",
    entry: [{ via: "input-rule", note: ": then a name" }],
    static: "not-applicable",
    limits: [
      "8 suggestions",
      "A closing colon converts only an exact name",
      "Not inside code blocks",
    ],
  },
  {
    key: "ux:autosave",
    kind: "ux",
    label: "Autosave",
    entry: [{ via: "host", note: "Pass an EditorPersistenceAdapter" }],
    static: "not-applicable",
    limits: [
      "Waits 800 ms after a change by default",
      "A revision conflict asks the user to reload",
    ],
  },
  {
    key: "ux:read-only",
    kind: "ux",
    label: "Read-only",
    entry: [{ via: "host", note: "readOnly prop" }],
    static: "not-applicable",
    limits: [],
  },
  {
    key: "ux:static-renderer",
    kind: "ux",
    label: "Static renderer",
    entry: [{ via: "host", note: "NotionLikeEditorStatic with a value" }],
    static: "not-applicable",
    limits: ["Page links have no URL in output", "No editing"],
  },
  {
    key: "ux:recovery",
    kind: "ux",
    label: "Recovery notice",
    entry: [
      {
        via: "host",
        note: "Shown when a saved document is invalid, unsupported or from a newer version",
      },
    ],
    static: "not-applicable",
    limits: ["The original stays in recovery storage"],
  },
];

const GROUPS: readonly { kind: FeatureKind; heading: string }[] = [
  { kind: "block", heading: "Blocks" },
  { kind: "inline", heading: "Inline" },
  { kind: "mark", heading: "Text styles" },
  { kind: "block-attribute", heading: "Block attributes" },
  { kind: "ux", heading: "Editing experience" },
];

function entryText(point: FeatureEntryPoint): string {
  if (point.via === "slash") {
    const label = point.id === undefined ? undefined : SLASH_ITEM_LABELS[point.id];
    return `Slash "${label ?? point.id ?? ""}"`;
  }

  if (point.via === "shortcut") {
    return `Shortcut ${point.keys ?? ""}${point.note === undefined ? "" : ` (${point.note})`}`;
  }

  if (point.via === "input-rule") {
    return `Input rule "${point.note ?? ""}"`;
  }

  if (point.via === "toolbar") {
    return `Toolbar "${point.note ?? point.id ?? ""}"`;
  }

  if (point.via === "block-menu") {
    return `Block menu "${point.note ?? point.id ?? ""}"`;
  }

  const name = point.via === "paste" ? "Paste" : point.via === "pointer" ? "Pointer" : "Host";
  return point.note === undefined ? name : `${name} (${point.note})`;
}

function featureLine(feature: FeatureEntry): string {
  const entries = feature.entry.map(entryText).join("; ");
  const staticText = feature.static === "rendered" ? "yes" : "n/a";
  const limits = feature.limits.length === 0 ? "" : ` Limits: ${feature.limits.join("; ")}.`;
  return `- **${feature.label}** — \`${feature.key}\`. Entry: ${entries}. Static: ${staticText}.${limits}`;
}

// The README feature list. Grouped by kind, one line per feature.
export function renderFeatureList(inventory: readonly FeatureEntry[] = FEATURE_INVENTORY): string {
  const sections: string[] = [];
  for (const group of GROUPS) {
    const lines = inventory.filter((feature) => feature.kind === group.kind).map(featureLine);
    sections.push(`### ${group.heading}\n\n${lines.join("\n")}`);
  }

  return `${sections.join("\n\n")}\n`;
}

// The README keyboard shortcut list. One line per shortcut entry point.
export function renderShortcutList(inventory: readonly FeatureEntry[] = FEATURE_INVENTORY): string {
  const lines: string[] = [];
  for (const feature of inventory) {
    for (const point of feature.entry) {
      if (point.via !== "shortcut") {
        continue;
      }

      const note = point.note === undefined ? "" : ` (${point.note})`;
      lines.push(`- ${point.keys ?? ""} — ${feature.label}${note}`);
    }
  }

  return `${lines.join("\n")}\n`;
}
