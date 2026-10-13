import { KEYS } from "platejs";

import type { EditorValue } from "../lib/document/editor-value";

// The worst-case fixture combines every stored feature in one legal document.
// It is built from plain objects that follow the stored shape in the demo document.
// Each block id is fixed so a failing test can name the block it was looking at.

type Node = Record<string, unknown>;

function text(value: string, marks: Record<string, unknown> = {}): Node {
  return { text: value, ...marks };
}

function element(
  type: string,
  id: string,
  children: Node[],
  attrs: Record<string, unknown> = {},
): Node {
  return { type, id, ...attrs, children };
}

function paragraph(id: string, children: Node[], attrs: Record<string, unknown> = {}): Node {
  return element(KEYS.p, id, children, attrs);
}

function emptyVoid(type: string, id: string, attrs: Record<string, unknown>): Node {
  return element(type, id, [text("")], attrs);
}

// Inline code and keyboard exclude each other in the commands, so kbd is kept on its own leaf below.
const ALL_MARKS_ON_ONE_LEAF: Node = text("all marks", {
  bold: true,
  italic: true,
  underline: true,
  strikethrough: true,
  code: true,
  color: "red",
  backgroundColor: "yellow",
  fontSize: "18px",
  fontFamily: "serif",
});

// Each mark on its own leaf, so a sup and a sub never share one leaf.
const EVERY_MARK_LEAVES: Node[] = [
  text("bold ", { bold: true }),
  text("italic ", { italic: true }),
  text("underline ", { underline: true }),
  text("strike ", { strikethrough: true }),
  text("code ", { code: true }),
  text("up", { superscript: true }),
  text(" ", {}),
  text("down", { subscript: true }),
  text(" ", {}),
  text("key", { kbd: true }),
  text(" ", {}),
  text("color", { color: "blue" }),
  text(" ", {}),
  text("mark", { backgroundColor: "green" }),
  text(" ", {}),
  text("size", { fontSize: "24px" }),
  text(" ", {}),
  text("family", { fontFamily: "mono" }),
];

const VIETNAMESE_NFD = "Tiếng Việt có dấu, nhiều tổ hợp dấu.".normalize("NFD");
const CJK = "编辑器文档与段落";
const EMOJI_ZWJ = "\u{1F469}‍\u{1F4BB} \u{1F3F3}️‍\u{1F308}";
const RTL = "مرحبا بالعالم שלום";
const LONG = "abcdefghij".repeat(500);

export const WORST_CASE_TITLE_ID = "wc-title";

const WORST_CASE_NODES: Node[] = [
  element(KEYS.h1, WORST_CASE_TITLE_ID, [text("Worst case")]),

  // Every mark, a link, a mention, an inline date, an inline equation and a footnote reference.
  paragraph("wc-marks", [
    text("start "),
    element(KEYS.link, "wc-link", [text("link text", { bold: true })], {
      url: "https://example.com/a?b=1#c",
    }),
    text(" "),
    emptyVoid(KEYS.mention, "wc-mention", {
      entityType: "person",
      entityId: "person-wc",
      label: "Wc Person",
    }),
    text(" "),
    emptyVoid(KEYS.date, "wc-date", { date: "2026-10-12" }),
    text(" "),
    emptyVoid(KEYS.inlineEquation, "wc-ieq", { texExpression: "e^{i\\pi}+1=0" }),
    text(" "),
    emptyVoid("footnote_ref", "wc-ref-1", { footnoteId: "fn-one" }),
    ...EVERY_MARK_LEAVES,
    ALL_MARKS_ON_ONE_LEAF,
  ]),

  paragraph("wc-unicode-nfd", [text(VIETNAMESE_NFD)]),
  paragraph("wc-unicode-cjk", [text(CJK)]),
  paragraph("wc-unicode-emoji", [text(EMOJI_ZWJ)]),
  paragraph("wc-unicode-rtl", [text(RTL)], { align: "right" }),
  paragraph("wc-long", [text(LONG)], { lineHeight: 1.5 }),

  // Block attributes on every block type that allows them.
  paragraph("wc-attr-align", [text("centered")], { align: "center", lineHeight: 1.75 }),
  paragraph("wc-attr-justify", [text("justified")], {
    align: "justify",
    lineHeight: 1,
    indent: 2,
    textTone: "blue",
    backgroundTone: "yellow",
  }),
  element(KEYS.h2, "wc-attr-h2", [text("Heading with tones")], {
    align: "left",
    indent: 1,
    textTone: "purple",
    backgroundTone: "gray",
  }),
  element(KEYS.h3, "wc-attr-h3", [text("Heading three")], { align: "right" }),
  element(KEYS.blockquote, "wc-attr-quote", [paragraph("wc-attr-quote-p", [text("toned quote")])], {
    indent: 1,
    textTone: "green",
    backgroundTone: "pink",
  }),

  // A table: header and body cells hold paragraphs with marks, a link and a date.
  element(
    KEYS.table,
    "wc-table",
    [
      element(KEYS.tr, "wc-table-r1", [
        element(KEYS.th, "wc-table-r1c1", [paragraph("wc-table-r1c1-p", [text("Head")])]),
        element(KEYS.th, "wc-table-r1c2", [paragraph("wc-table-r1c2-p", [text("Mark")])]),
      ]),
      element(KEYS.tr, "wc-table-r2", [
        element(KEYS.td, "wc-table-r2c1", [
          paragraph("wc-table-r2c1-p", [
            text(""),
            element(KEYS.link, "wc-table-link", [text("cell link")], {
              url: "mailto:cell@example.com",
            }),
            text(" "),
            emptyVoid(KEYS.date, "wc-table-date", { date: "2000-02-29" }),
            text(""),
          ]),
        ]),
        element(KEYS.td, "wc-table-r2c2", [
          paragraph("wc-table-r2c2-p", [ALL_MARKS_ON_ONE_LEAF]),
          paragraph("wc-table-r2c2-q", [
            text(""),
            emptyVoid("footnote_ref", "wc-table-ref", { footnoteId: "fn-two" }),
            text(""),
          ]),
        ]),
      ]),
    ],
    { colSizes: [200, 300] },
  ),

  // A toggle nested to the maximum depth, holding lists, a callout and a quote.
  element(KEYS.toggle, "wc-toggle-1", [
    paragraph("wc-toggle-1-label", [text("Level one")]),
    element(KEYS.toggle, "wc-toggle-2", [
      paragraph("wc-toggle-2-label", [text("Level two")]),
      element(KEYS.toggle, "wc-toggle-3", [
        element(KEYS.h3, "wc-toggle-3-label", [text("Level three heading")]),
        paragraph("wc-bullet-1", [text("bulleted")], { indent: 1, listStyleType: "disc" }),
        paragraph("wc-bullet-2", [text("bulleted nested")], { indent: 2, listStyleType: "disc" }),
        paragraph("wc-number-1", [text("numbered")], { indent: 1, listStyleType: "decimal" }),
        paragraph("wc-number-restart", [text("restarted")], {
          indent: 1,
          listStyleType: "decimal",
          listStart: 4,
          listRestart: 4,
        }),
        paragraph("wc-todo-off", [text("unchecked")], {
          indent: 1,
          listStyleType: "todo",
          checked: false,
        }),
        paragraph("wc-todo-on", [text("checked")], {
          indent: 1,
          listStyleType: "todo",
          checked: true,
        }),
        element(KEYS.callout, "wc-callout", [paragraph("wc-callout-p", [text("callout text")])], {
          icon: "info",
          variant: "warning",
        }),
        element(KEYS.blockquote, "wc-toggle-quote", [
          paragraph("wc-toggle-quote-p", [text("quoted in a toggle")]),
        ]),
      ]),
    ]),
  ]),

  // A toggle heading: the label is a heading.
  element(KEYS.toggle, "wc-toggle-heading", [
    element(KEYS.h2, "wc-toggle-heading-label", [text("Toggle heading")]),
    paragraph("wc-toggle-heading-body", [text("body under a heading label")]),
  ]),

  // Columns: a bookmark, a page link, a code block and an equation.
  element(KEYS.columnGroup, "wc-columns", [
    element(
      KEYS.column,
      "wc-col-1",
      [
        emptyVoid("bookmark", "wc-bookmark", {
          url: "https://example.com/bookmark",
          title: "Example bookmark",
          description: "A description",
          siteName: "Example",
        }),
        emptyVoid("page_link", "wc-page-link", {
          pageId: "page-wc",
          title: "Worst case page",
          kind: "link",
        }),
      ],
      { width: "50%" },
    ),
    element(
      KEYS.column,
      "wc-col-2",
      [
        element(
          KEYS.codeBlock,
          "wc-code",
          [
            element(KEYS.codeLine, "wc-code-1", [text("const x = 1;")]),
            element(KEYS.codeLine, "wc-code-2", [text("export { x };")]),
          ],
          { lang: "typescript" },
        ),
        emptyVoid(KEYS.equation, "wc-equation", { texExpression: "\\sum_{i=1}^{n} i" }),
      ],
      { width: "50%" },
    ),
  ]),

  // Synced reference to an existing block.
  element(
    KEYS.callout,
    "wc-synced-original",
    [paragraph("wc-synced-original-p", [text("original")])],
    {
      icon: "lightbulb",
      variant: "success",
    },
  ),
  emptyVoid("synced_ref", "wc-synced-ref", { targetBlockId: "wc-synced-original" }),

  // Footnotes: one referenced definition, one unreferenced definition, and a reference with no definition.
  paragraph("wc-footnote-line", [
    text("A reference to a definition "),
    emptyVoid("footnote_ref", "wc-footnote-ref-2", { footnoteId: "fn-one" }),
    text(" and a dangling one "),
    emptyVoid("footnote_ref", "wc-footnote-dangling", { footnoteId: "fn-missing" }),
    text("."),
  ]),
  element("footnote_def", "wc-footnote-def-one", [text("The first note.")], {
    footnoteId: "fn-one",
  }),
  element("footnote_def", "wc-footnote-def-two", [text("Cited from the table.")], {
    footnoteId: "fn-two",
  }),
  element("footnote_def", "wc-footnote-def-unref", [text("Nobody cites this.")], {
    footnoteId: "fn-unreferenced",
  }),
];

// The nodes are plain objects in the stored shape. The cast is the only place the fixture meets the editor type.
export const WORST_CASE_VALUE = WORST_CASE_NODES as unknown as EditorValue;
