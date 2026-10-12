import type { EditorValue } from "../../lib/document/editor-value";

const paragraph = (id: string, text: string, extra: Record<string, unknown> = {}) => ({
  type: "p",
  id,
  ...extra,
  children: [{ text }],
});

// One of every stored node, attribute, and mark. List attributes that cannot
// share a node live on their own paragraphs.
export const IO_ALL_NODES = [
  { type: "h1", id: "h1", align: "center", children: [{ text: "Heading 1" }] },
  { type: "h2", id: "h2", align: "right", children: [{ text: "Heading 2" }] },
  { type: "h3", id: "h3", align: "justify", children: [{ text: "Heading 3" }] },
  {
    type: "p",
    id: "p-marks",
    align: "left",
    lineHeight: 1.5,
    children: [
      { text: "plain " },
      { text: "bold", bold: true },
      { text: " " },
      { text: "italic", italic: true },
      { text: " " },
      { text: "under", underline: true },
      { text: " " },
      { text: "strike", strikethrough: true },
      { text: " " },
      { text: "code", code: true },
      { text: " " },
      { text: "sub", subscript: true },
      { text: " " },
      { text: "sup", superscript: true },
      { text: " " },
      { text: "red", color: "red" },
      { text: " " },
      { text: "yellow", backgroundColor: "yellow" },
      { text: " " },
      { text: "12px", fontSize: "12px" },
      { text: " " },
      { text: "serif", fontFamily: "serif" },
      { text: " and " },
      {
        type: "a",
        id: "link",
        url: "https://example.com",
        children: [{ text: "a link" }],
      },
      { text: " plus " },
      {
        type: "mention",
        id: "mention",
        entityType: "person",
        entityId: "person-1",
        label: "Ada",
        children: [{ text: "" }],
      },
      { text: "\nnext line" },
    ],
  },
  paragraph("bullet", "Bullet", { indent: 1, listStyleType: "disc" }),
  paragraph("number", "Number", {
    indent: 1,
    listStyleType: "decimal",
    listStart: 3,
    listRestart: 3,
  }),
  paragraph("number-polite", "Polite", {
    indent: 1,
    listStyleType: "decimal",
    listStart: 4,
    listRestartPolite: 4,
  }),
  paragraph("todo", "Todo", { indent: 1, listStyleType: "todo", checked: true }),
  {
    type: "blockquote",
    id: "quote",
    children: [paragraph("quote-p", "Quoted")],
  },
  { type: "hr", id: "hr", children: [{ text: "" }] },
  {
    type: "callout",
    id: "callout",
    icon: "info",
    variant: "warning",
    children: [paragraph("callout-p", "Watch")],
  },
  {
    type: "toggle",
    id: "toggle",
    children: [paragraph("toggle-p", "Summary"), paragraph("toggle-body", "Hidden")],
  },
  {
    type: "toggle",
    id: "toggle-h",
    children: [
      { type: "h2", id: "toggle-h2", children: [{ text: "Section" }] },
      paragraph("toggle-h-body", "Inside"),
    ],
  },
  {
    type: "code_block",
    id: "code",
    lang: "typescript",
    children: [
      { type: "code_line", id: "code-1", children: [{ text: "const n = 1;" }] },
      { type: "code_line", id: "code-2", children: [{ text: "n;" }] },
    ],
  },
  {
    type: "table",
    id: "table",
    colSizes: [120, null],
    children: [
      {
        type: "tr",
        id: "tr-1",
        children: [
          {
            type: "th",
            id: "th-1",
            colSpan: 2,
            children: [paragraph("th-p", "Name")],
          },
        ],
      },
      {
        type: "tr",
        id: "tr-2",
        children: [
          {
            type: "td",
            id: "td-1",
            rowSpan: 2,
            children: [paragraph("td-p", "Ada")],
          },
          {
            type: "td",
            id: "td-2",
            children: [paragraph("td-p2", "One")],
          },
        ],
      },
      {
        type: "tr",
        id: "tr-3",
        children: [
          {
            type: "td",
            id: "td-3",
            children: [paragraph("td-p3", "Two")],
          },
        ],
      },
    ],
  },
  {
    type: "table",
    id: "table-spans",
    children: [
      {
        type: "tr",
        id: "span-r1",
        children: [
          {
            type: "th",
            id: "span-th",
            rowSpan: 2,
            children: [paragraph("span-th-p", "Side")],
          },
          {
            type: "td",
            id: "span-td",
            colSpan: 2,
            children: [paragraph("span-td-p", "Wide")],
          },
        ],
      },
      {
        type: "tr",
        id: "span-r2",
        children: [
          {
            type: "td",
            id: "span-td-2",
            children: [paragraph("span-td-2-p", "Next")],
          },
          {
            type: "td",
            id: "span-td-3",
            children: [paragraph("span-td-3-p", "Last")],
          },
        ],
      },
    ],
  },
  {
    type: "column_group",
    id: "columns",
    children: [
      {
        type: "column",
        id: "column-a",
        width: "50%",
        children: [paragraph("column-a-p", "Left")],
      },
      {
        type: "column",
        id: "column-b",
        width: "50%",
        children: [paragraph("column-b-p", "Right")],
      },
    ],
  },
  {
    type: "bookmark",
    id: "bookmark",
    url: "https://example.com/docs",
    title: "Docs",
    description: "Reference",
    siteName: "Example",
    imageUrl: "https://example.com/cover.png",
    fetchedAt: "2026-10-08T00:00:00.000Z",
    children: [{ text: "" }],
  },
  { type: "equation", id: "equation", texExpression: "e=mc^2", children: [{ text: "" }] },
  { type: "toc", id: "toc", maxDepth: 2, children: [{ text: "" }] },
  {
    type: "p",
    id: "synced-target",
    children: [{ text: "Stored once" }],
  },
  {
    type: "synced_ref",
    id: "synced",
    targetBlockId: "synced-target",
    children: [{ text: "" }],
  },
] as unknown as EditorValue;

export const IO_LOSSLESS_MARKDOWN = [
  { type: "h1", id: "h1", children: [{ text: "Title" }] },
  { type: "p", id: "p", children: [{ text: "Line\nbreak and " }, { text: "bold", bold: true }] },
  paragraph("bullet", "Bullet", { indent: 1, listStyleType: "disc" }),
  paragraph("number", "Step", { indent: 1, listStyleType: "decimal", listStart: 2 }),
  paragraph("todo", "Task", { indent: 1, listStyleType: "todo", checked: false }),
  { type: "blockquote", id: "quote", children: [paragraph("quote-p", "Quoted")] },
  { type: "hr", id: "hr", children: [{ text: "" }] },
  {
    type: "code_block",
    id: "code",
    lang: "typescript",
    children: [{ type: "code_line", id: "code-1", children: [{ text: "const n = 1;" }] }],
  },
  {
    type: "table",
    id: "table",
    children: [
      {
        type: "tr",
        id: "tr-1",
        children: [
          { type: "th", id: "th", children: [paragraph("th-p", "A")] },
          { type: "th", id: "th2", children: [paragraph("th-p2", "B")] },
        ],
      },
      {
        type: "tr",
        id: "tr-2",
        children: [
          { type: "td", id: "td", children: [paragraph("td-p", "1")] },
          { type: "td", id: "td2", children: [paragraph("td-p2", "2")] },
        ],
      },
    ],
  },
  { type: "equation", id: "equation", texExpression: "e=mc^2", children: [{ text: "" }] },
  {
    type: "callout",
    id: "callout",
    variant: "success",
    children: [paragraph("callout-p", "Tip")],
  },
  {
    type: "toggle",
    id: "toggle",
    children: [paragraph("toggle-p", "Summary"), paragraph("toggle-body", "Hidden")],
  },
] as unknown as EditorValue;
