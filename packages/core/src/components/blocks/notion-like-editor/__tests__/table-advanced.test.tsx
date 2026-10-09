import { describe, expect, test } from "bun:test";
import { type SlateEditor, type TElement } from "platejs";
import { createPlateEditor } from "platejs/react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";

import { createEditorDocument } from "../lib/document/editor-document";
import { parseEditorDocument, type ParseResult } from "../lib/document/editor-document-validate";
import { runEditorCommand } from "../lib/commands/editor-commands";
import {
  deleteTableRow,
  duplicateTableColumn,
  duplicateTableRow,
  mergeCellsReason,
  mergeTableCells,
  moveColumnReason,
  moveRowReason,
  moveTableColumnRight,
  moveTableRowDown,
  moveTableRowUp,
  splitCellReason,
  splitTableCell,
} from "../lib/commands/editor-table-commands";
import { pasteRepairsOf } from "../lib/paste/editor-paste";
import { createEditorPlugins } from "../lib/plugins/editor-plugins";
import { EditorSurface } from "../components/editor/editor-surface";
import { TABLE_MAX_COLUMNS, TABLE_MAX_ROWS } from "../lib/document/editor-document-schema";
import type { EditorValue } from "../lib/document/editor-value";
import { caret, createEditor, expectOk, expectUnsupported, field, isRecord } from "./test-utils";

function paragraph(text: string, id: string, marks?: Record<string, boolean>): TElement {
  return {
    type: "p",
    id,
    children: [marks === undefined ? { text } : { text, ...marks }],
  };
}

function cell(
  kind: "td" | "th",
  id: string,
  children: TElement[] | string,
  spans?: { colSpan?: number; rowSpan?: number },
): TElement {
  return {
    type: kind,
    id,
    ...spans,
    children: typeof children === "string" ? [paragraph(children, `${id}-p`)] : children,
  };
}

function row(id: string, cells: TElement[]): TElement {
  return { type: "tr", id, children: cells };
}

function tableNode(id: string, rows: TElement[], colSizes?: (number | null)[]): TElement {
  return {
    type: "table",
    id,
    ...(colSizes === undefined ? {} : { colSizes }),
    children: rows,
  };
}

function documentOf(content: EditorValue) {
  return parseEditorDocument(createEditorDocument("doc", content));
}

function issues(result: ParseResult): string {
  if (result.status === "ok" || result.status === "future-version") {
    return "";
  }

  return result.issues.map((issue) => issue.message).join("\n");
}

function isElement(node: unknown): node is TElement {
  return isRecord(node) && typeof node.type === "string" && Array.isArray(node.children);
}

function nodeText(node: unknown): string {
  if (Array.isArray(node)) {
    return node.map((child) => nodeText(child)).join("");
  }

  if (!isRecord(node)) {
    return "";
  }

  if (typeof node.text === "string") {
    return node.text;
  }

  if (!Array.isArray(node.children)) {
    return "";
  }

  return node.children.map((child) => nodeText(child)).join("");
}

function tablesOf(value: readonly unknown[]): TElement[] {
  const found: TElement[] = [];
  const visit = (node: unknown): void => {
    if (!isElement(node)) {
      return;
    }

    if (node.type === "table") {
      found.push(node);
    }

    for (const child of node.children) {
      visit(child);
    }
  };

  for (const node of value) {
    visit(node);
  }

  return found;
}

function cellTexts(table: TElement): string[][] {
  return table.children
    .filter(isElement)
    .map((tableRow) => tableRow.children.filter(isElement).map((tableCell) => nodeText(tableCell)));
}

function paragraphsOf(tableCell: TElement): string[] {
  return tableCell.children.filter(isElement).map((child) => nodeText(child));
}

function idsOf(node: unknown, found: string[] = []): string[] {
  if (Array.isArray(node)) {
    for (const child of node) {
      idsOf(child, found);
    }

    return found;
  }

  if (!isRecord(node)) {
    return found;
  }

  if (typeof node.id === "string") {
    found.push(node.id);
  }

  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      idsOf(child, found);
    }
  }

  return found;
}

function selectCell(
  editor: SlateEditor,
  path: number[],
  rowIndex: number,
  columnIndex: number,
): void {
  editor.tf.select(caret([...path, rowIndex, columnIndex, 0, 0], 0));
}

function selectCells(
  editor: SlateEditor,
  anchor: number[],
  focus: number[],
  focusOffset: number,
): void {
  editor.tf.select({
    anchor: { path: anchor, offset: 0 },
    focus: { path: focus, offset: focusOffset },
  });
}

function pasteData(editor: SlateEditor, plain?: string, html?: string): void {
  const data = new DataTransfer();
  if (plain !== undefined) {
    data.setData("text/plain", plain);
  }

  if (html !== undefined) {
    data.setData("text/html", html);
  }

  editor.tf.insertData(data);
}

function repairText(editor: SlateEditor): string {
  return pasteRepairsOf(editor)
    .map((repair) => repair.message)
    .join("\n");
}

function isReactContainer(value: object): value is Parameters<typeof createRoot>[0] {
  return "nodeType" in value && value.nodeType === 1;
}

function stubAnimationFrame(): () => void {
  const previousFrame = Reflect.get(globalThis, "requestAnimationFrame");
  const previousCancel = Reflect.get(globalThis, "cancelAnimationFrame");
  Reflect.set(globalThis, "requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  Reflect.set(globalThis, "cancelAnimationFrame", () => {});
  Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

  return () => {
    Reflect.set(globalThis, "requestAnimationFrame", previousFrame);
    Reflect.set(globalThis, "cancelAnimationFrame", previousCancel);
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT");
  };
}

async function mountTable(value: EditorValue, readOnly = false) {
  const restoreFrame = stubAnimationFrame();
  const before = new Set(Array.from(document.body.childNodes));
  const host = document.createElement("div");
  document.body.appendChild(host);
  const editor = createPlateEditor({
    plugins: createEditorPlugins(),
    value,
  });
  let root: Root | undefined;
  if (!isReactContainer(host)) {
    throw new Error("Missing mount node.");
  }

  await act(async () => {
    root = createRoot(host);
    root.render(
      <EditorSurface editor={editor} readOnly={readOnly} placeholder="" className="editor" />,
    );
  });

  return {
    editor,
    host,
    cleanup: async () => {
      await act(async () => {
        root?.unmount();
      });
      for (const node of Array.from(document.body.childNodes)) {
        if (!before.has(node)) {
          node.remove();
        }
      }
      restoreFrame();
    },
  };
}

const release = tableNode(
  "release",
  [
    row("r1", [cell("th", "plan", "Release plan", { colSpan: 2 }), cell("th", "status", "Status")]),
    row("r2", [
      cell("td", "editor", "Editor", { rowSpan: 2 }),
      cell("td", "merge", "Merge"),
      cell("td", "now", "Now"),
    ]),
    row("r3", [cell("td", "split", "Split"), cell("td", "next", "Next")]),
  ],
  [160, 240, 120],
);

describe("table span schema", () => {
  test("spans and colSizes round-trip, including an automatic column", () => {
    const sized = tableNode(
      "sized",
      [row("row", [cell("td", "a", "A"), cell("td", "b", "B")])],
      [160, null],
    );
    const parsed = expectOk(documentOf([release, sized]));

    expect(parsed.repairs).toEqual([]);
    expect(JSON.stringify(parsed.document.content[0])).toContain('"colSpan":2');
    expect(JSON.stringify(parsed.document.content[0])).toContain('"rowSpan":2');
    expect(field(parsed.document.content[0], "colSizes")).toEqual([160, 240, 120]);
    expect(field(parsed.document.content[1], "colSizes")).toEqual([160, null]);
  });

  test("overlap, a span past the grid, and a stored span of 1 are unsupported", () => {
    const overlap = expectUnsupported(
      documentOf([
        tableNode("table", [
          row("r1", [cell("td", "a", "A", { rowSpan: 2 }), cell("td", "b", "B")]),
          row("r2", [cell("td", "c", "C"), cell("td", "d", "D")]),
        ]),
      ]),
    );
    const past = expectUnsupported(
      documentOf([
        tableNode("table", [
          row("r1", [cell("td", "a", "A", { rowSpan: 3 })]),
          row("r2", [cell("td", "b", "B")]),
        ]),
      ]),
    );
    const storedOne = expectUnsupported(
      documentOf([tableNode("table", [row("r1", [cell("td", "a", "A", { colSpan: 1 })])])]),
    );

    expect(issues(overlap)).toContain("overlaps another cell");
    expect(issues(past)).toContain("extends past the table");
    expect(issues(storedOne)).toContain("stores colSpan 1");
    expect(overlap.status === "unsupported" && overlap.raw).toBeTruthy();
  });

  test("colSizes of 0, NaN, a negative, the wrong length, or above 1200 are unsupported", () => {
    const zero = expectUnsupported(
      documentOf([tableNode("table", [row("r1", [cell("td", "a", "A")])], [0])]),
    );
    const negative = expectUnsupported(
      documentOf([tableNode("table", [row("r1", [cell("td", "a", "A")])], [-4])]),
    );
    const huge = expectUnsupported(
      documentOf([tableNode("table", [row("r1", [cell("td", "a", "A")])], [1201])]),
    );
    const length = expectUnsupported(
      documentOf([tableNode("table", [row("r1", [cell("td", "a", "A")])], [80, 90])]),
    );
    const fractional = expectUnsupported(
      documentOf([tableNode("table", [row("r1", [cell("td", "a", "A")])], [80.5])]),
    );
    const missing = tableNode("table", [row("r1", [cell("td", "a", "A")])], [Number.NaN]);
    const nan = expectUnsupported(documentOf([missing]));

    expect(issues(zero)).toContain("colSizes 0");
    expect(issues(negative)).toContain("negative");
    expect(issues(huge)).toContain("above 1200");
    expect(issues(length)).toContain("colSizes length");
    expect(issues(fractional)).toContain("non-integer");
    expect(issues(nan)).toContain("not a finite number");
  });
});

describe("table span normalizer", () => {
  test("repairs overlap, a span past the grid, and a stored span of 1", () => {
    const editor = createEditor([
      tableNode("overlap", [
        row("r1", [cell("td", "a", "A", { rowSpan: 2 }), cell("td", "b", "B")]),
        row("r2", [cell("td", "c", "C"), cell("td", "d", "D")]),
      ]),
      tableNode("past", [
        row("past-r1", [
          cell("td", "past-a", "Tall", { rowSpan: 3 }),
          cell("td", "past-side", "Side"),
        ]),
        row("past-r2", [cell("td", "past-b", "Below")]),
      ]),
      tableNode("one", [row("r1", [cell("td", "a", "Plain", { colSpan: 1, rowSpan: 1 })])]),
    ]);
    editor.tf.normalize({ force: true });
    const [overlap, past, one] = tablesOf(editor.children);

    expect(cellTexts(overlap ?? tableNode("missing", []))).toEqual([
      ["A", "B"],
      ["C", "D"],
    ]);
    expect(JSON.stringify(overlap)).not.toContain("rowSpan");
    expect(nodeText(past)).toContain("Tall");
    expect(nodeText(past)).toContain("Below");
    expect(JSON.stringify(past)).toContain('"rowSpan":2');
    expect(nodeText(one)).toContain("Plain");
    expect(JSON.stringify(one)).not.toContain("colSpan");
    expect(JSON.stringify(one)).not.toContain("rowSpan");
    editor.tf.normalize({ force: true });
    expect(tablesOf(editor.children)).toHaveLength(3);
  });

  test("repairs each invalid colSizes entry", () => {
    const editor = createEditor([
      tableNode("zero", [row("r1", [cell("td", "a", "A")])], [0]),
      tableNode("negative", [row("r1", [cell("td", "a", "A")])], [-12]),
      tableNode("huge", [row("r1", [cell("td", "a", "A")])], [1400]),
      tableNode("fraction", [row("r1", [cell("td", "a", "A")])], [80.4]),
      tableNode("long", [row("r1", [cell("td", "a", "A"), cell("td", "b", "B")])], [100, 110, 900]),
      tableNode("short", [row("r1", [cell("td", "a", "A"), cell("td", "b", "B")])], [100]),
      tableNode("nan", [row("r1", [cell("td", "a", "A")])], [Number.NaN]),
    ]);
    editor.tf.normalize({ force: true });
    const tables = tablesOf(editor.children);

    expect(field(tables[0], "colSizes")).toEqual([48]);
    expect(field(tables[1], "colSizes")).toEqual([48]);
    expect(field(tables[2], "colSizes")).toEqual([1200]);
    expect(field(tables[3], "colSizes")).toEqual([80]);
    expect(field(tables[4], "colSizes")).toEqual([100, 110]);
    expect(field(tables[5], "colSizes")).toEqual([100, null]);
    expect(field(tables[6], "colSizes")).toBeUndefined();
  });
});

describe("table merge and split", () => {
  test("merges a 2 by 2 in row-major order and keeps marks and paragraphs in one undo", () => {
    const editor = createEditor([
      tableNode("table", [
        row("r1", [
          cell("td", "a", [paragraph("A", "a-p", { bold: true })]),
          cell("td", "b", [paragraph("B1", "b1"), paragraph("B2", "b2")]),
        ]),
        row("r2", [cell("td", "c", "C"), cell("td", "d", "")]),
      ]),
    ]);
    editor.tf.normalize({ force: true });
    const before = JSON.stringify(editor.children);
    selectCells(editor, [0, 0, 0, 0, 0], [0, 1, 1, 0, 0], 0);
    const undos = editor.history.undos.length;
    expect(mergeCellsReason(editor)).toBeUndefined();
    expect(runEditorCommand(editor, mergeTableCells, undefined)).toBe(true);
    expect(editor.history.undos.length - undos).toBe(1);
    const table = tablesOf(editor.children)[0] ?? tableNode("missing", []);
    const merged = isElement(table.children[0]) ? table.children[0].children[0] : undefined;

    expect(cellTexts(table)[0]).toEqual(["AB1B2C"]);
    expect(isElement(merged) ? paragraphsOf(merged) : []).toEqual(["A", "B1", "B2", "C"]);
    expect(JSON.stringify(merged)).toContain('"bold":true');
    expect(field(merged, "colSpan")).toBe(2);
    expect(field(merged, "rowSpan")).toBe(2);
    editor.tf.undo();
    expect(JSON.stringify(editor.children)).toBe(before);
  });

  test("a selection that is not a multi-cell rectangle is disabled with the reason", () => {
    const editor = createEditor([
      tableNode("table", [
        row("r1", [cell("td", "a", "A"), cell("td", "b", "B")]),
        row("r2", [cell("td", "c", "C"), cell("td", "d", "D")]),
      ]),
    ]);
    selectCell(editor, [0], 0, 0);

    expect(mergeCellsReason(editor)).toBe("Select a rectangle of cells to merge");
    expect(mergeTableCells.isEnabled?.(editor)).toBe(false);
    expect(runEditorCommand(editor, mergeTableCells, undefined)).toBe(false);
  });

  test("splits a merged cell into the top-left and empty cells with new ids, in one undo", () => {
    const editor = createEditor([
      tableNode("table", [
        row("r1", [cell("td", "a", [paragraph("Kept", "kept")], { colSpan: 2, rowSpan: 2 })]),
        row("r2", []),
      ]),
    ]);
    editor.tf.normalize({ force: true });
    selectCell(editor, [0], 0, 0);
    const before = JSON.stringify(editor.children);
    const undos = editor.history.undos.length;
    expect(runEditorCommand(editor, splitTableCell, undefined)).toBe(true);
    expect(editor.history.undos.length - undos).toBe(1);
    const table = tablesOf(editor.children)[0] ?? tableNode("missing", []);
    const texts = cellTexts(table);
    const ids = idsOf(table);

    expect(texts[0]?.[0]).toBe("Kept");
    expect(texts.flat().filter((text) => text.length > 0)).toEqual(["Kept"]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain("kept");
    editor.tf.undo();
    expect(JSON.stringify(editor.children)).toBe(before);

    selectCell(editor, [0], 0, 0);
    const plain = createEditor([
      tableNode("plain", [row("r1", [cell("td", "a", "A"), cell("td", "b", "B")])]),
    ]);
    selectCell(plain, [0], 0, 0);
    expect(splitCellReason(plain)).toBe("Select a merged cell to split.");
    expect(splitTableCell.isEnabled?.(plain)).toBe(false);
  });
});

describe("table duplicate and move", () => {
  test("duplicates a row and a column with new ids and copies the column width", () => {
    const editor = createEditor([
      tableNode(
        "table",
        [
          row("r1", [cell("td", "a", "A"), cell("td", "b", "B")]),
          row("r2", [cell("td", "c", "C"), cell("td", "d", "D")]),
        ],
        [160, 200],
      ),
    ]);
    selectCell(editor, [0], 0, 0);
    expect(runEditorCommand(editor, duplicateTableRow, undefined)).toBe(true);
    let table = tablesOf(editor.children)[0] ?? tableNode("missing", []);
    expect(cellTexts(table)[1]).toEqual(["A", "B"]);
    const rowIds = idsOf(isElement(table.children[1]) ? table.children[1] : table);
    expect(rowIds).not.toContain("r1");
    expect(rowIds).not.toContain("a");
    expect(rowIds).not.toContain("a-p");

    selectCell(editor, [0], 0, 0);
    expect(runEditorCommand(editor, duplicateTableColumn, undefined)).toBe(true);
    table = tablesOf(editor.children)[0] ?? tableNode("missing", []);
    expect(cellTexts(table)[0]?.slice(0, 2)).toEqual(["A", "A"]);
    expect(field(table, "colSizes")).toEqual([160, 160, 200]);
    const firstRow = isElement(table.children[0]) ? table.children[0] : table;
    const cellIds = firstRow.children.filter(isElement).map((item) => field(item, "id"));
    expect(new Set(cellIds).size).toBe(cellIds.length);
  });

  test("duplicate is disabled across a span and at the cap", () => {
    const spanned = createEditor([
      tableNode("table", [
        row("r1", [cell("td", "a", "A", { rowSpan: 2 }), cell("td", "b", "B")]),
        row("r2", [cell("td", "c", "C")]),
      ]),
    ]);
    selectCell(spanned, [0], 0, 0);
    expect(duplicateTableRow.isEnabled?.(spanned)).toBe(false);
    expect(duplicateTableRow.disabledReason?.(spanned)).toBe("A merged cell crosses this row.");
    selectCell(spanned, [0], 0, 1);
    expect(duplicateTableColumn.isEnabled?.(spanned)).toBe(true);
    selectCell(spanned, [0], 0, 0);
    expect(duplicateTableColumn.disabledReason?.(spanned)).toBe(
      "A merged cell crosses this column.",
    );

    const rows = Array.from({ length: TABLE_MAX_ROWS }, (_, index) =>
      row(`r${index}`, [cell("td", `c${index}`, String(index))]),
    );
    const fullRows = createEditor([tableNode("table", rows)]);
    selectCell(fullRows, [0], 0, 0);
    expect(duplicateTableRow.disabledReason?.(fullRows)).toBe(
      `This table already has ${TABLE_MAX_ROWS} rows.`,
    );

    const columns = [
      row(
        "r1",
        Array.from({ length: TABLE_MAX_COLUMNS }, (_, index) => cell("td", `c${index}`, "x")),
      ),
    ];
    const fullColumns = createEditor([tableNode("table", columns)]);
    selectCell(fullColumns, [0], 0, 0);
    expect(duplicateTableColumn.disabledReason?.(fullColumns)).toBe(
      `This table already has ${TABLE_MAX_COLUMNS} columns.`,
    );
  });

  test("moves a row and a column, and colSizes follows the column", () => {
    const editor = createEditor([
      tableNode(
        "table",
        [
          row("r1", [cell("td", "a", "A"), cell("td", "b", "B"), cell("td", "c", "C")]),
          row("r2", [cell("td", "d", "D"), cell("td", "e", "E"), cell("td", "f", "F")]),
          row("r3", [cell("td", "g", "G"), cell("td", "h", "H"), cell("td", "i", "I")]),
        ],
        [100, 140, 180],
      ),
    ]);
    editor.tf.normalize({ force: true });
    const before = JSON.stringify(editor.children);
    selectCell(editor, [0], 0, 0);
    expect(moveRowReason(editor, "up")).toBe("This row is already at the top.");
    expect(moveTableRowUp.isEnabled?.(editor)).toBe(false);
    expect(moveColumnReason(editor, "left")).toBe("This column is already at the left.");
    selectCell(editor, [0], 1, 1);
    const undos = editor.history.undos.length;
    expect(runEditorCommand(editor, moveTableRowDown, undefined)).toBe(true);
    expect(editor.history.undos.length - undos).toBe(1);
    expect(cellTexts(tablesOf(editor.children)[0] ?? tableNode("missing", []))[1]).toEqual([
      "G",
      "H",
      "I",
    ]);
    editor.tf.undo();
    expect(JSON.stringify(editor.children)).toBe(before);

    selectCell(editor, [0], 0, 0);
    expect(runEditorCommand(editor, moveTableColumnRight, undefined)).toBe(true);
    const table = tablesOf(editor.children)[0] ?? tableNode("missing", []);
    expect(cellTexts(table)[0]).toEqual(["B", "A", "C"]);
    expect(field(table, "colSizes")).toEqual([140, 100, 180]);
    editor.tf.undo();
    expect(JSON.stringify(editor.children)).toBe(before);
  });

  test("move is disabled when a span crosses the boundary", () => {
    const editor = createEditor([
      tableNode("table", [
        row("r1", [cell("td", "a", "A", { colSpan: 2 }), cell("td", "c", "C")]),
        row("r2", [cell("td", "d", "D"), cell("td", "e", "E"), cell("td", "f", "F")]),
        row("r3", [cell("td", "g", "G", { rowSpan: 1 })]),
      ]),
    ]);
    editor.tf.normalize({ force: true });
    selectCell(editor, [0], 0, 0);
    expect(moveColumnReason(editor, "right")).toBe("A merged cell crosses this column.");
    expect(moveTableColumnRight.isEnabled?.(editor)).toBe(false);

    const rows = createEditor([
      tableNode("table", [
        row("r1", [cell("td", "a", "A", { rowSpan: 2 }), cell("td", "b", "B")]),
        row("r2", [cell("td", "c", "C")]),
        row("r3", [cell("td", "d", "D"), cell("td", "e", "E")]),
      ]),
    ]);
    selectCell(rows, [0], 0, 1);
    expect(moveRowReason(rows, "down")).toBe("A merged cell crosses this row.");
    expect(moveTableRowDown.isEnabled?.(rows)).toBe(false);
  });
});

describe("table delete through a merged cell", () => {
  test("deleting the covered row shrinks the span and keeps the anchor text", () => {
    const editor = createEditor([
      tableNode("table", [
        row("r1", [cell("td", "a", "Keep", { rowSpan: 2 }), cell("td", "b", "Gone")]),
        row("r2", [cell("td", "c", "Covered")]),
        row("r3", [cell("td", "d", "Tail"), cell("td", "e", "End")]),
      ]),
    ]);
    selectCell(editor, [0], 1, 0);
    expect(runEditorCommand(editor, deleteTableRow, undefined)).toBe(true);
    const table = tablesOf(editor.children)[0] ?? tableNode("missing", []);

    expect(nodeText(table)).toContain("Keep");
    expect(nodeText(table)).not.toContain("Covered");
    expect(nodeText(table)).toContain("Tail");
    expect(JSON.stringify(table)).not.toContain("rowSpan");
    const anchor = editor.selection?.anchor;
    const text = anchor ? editor.api.node(anchor.path)?.[0] : undefined;
    const value = isRecord(text) && typeof text.text === "string" ? text.text : "";
    expect(value).toContain("Tail");
    if (anchor) {
      editor.tf.select({
        anchor: { path: anchor.path, offset: 0 },
        focus: { path: anchor.path, offset: value.length },
      });
    }
    expect(nodeText(editor.api.getFragment())).toContain("Tail");
  });

  test("deleting the anchor row moves merged text that still extends below that row", () => {
    const editor = createEditor([
      tableNode("table", [
        row("r1", [cell("td", "a", "Keep", { rowSpan: 3 }), cell("td", "b", "Only")]),
        row("r2", [cell("td", "c", "Mid")]),
        row("r3", [cell("td", "d", "Last")]),
      ]),
    ]);
    selectCell(editor, [0], 0, 1);
    expect(runEditorCommand(editor, deleteTableRow, undefined)).toBe(true);
    const table = tablesOf(editor.children)[0] ?? tableNode("missing", []);

    expect(nodeText(table)).toContain("Keep");
    expect(nodeText(table)).not.toContain("Only");
    expect(nodeText(table)).toContain("Mid");
    expect(JSON.stringify(table)).toContain('"rowSpan":2');
  });
});

describe("table column resize", () => {
  test("a drag commits one undo, keyboard steps, the clamp, and double-click resets", async () => {
    const mounted = await mountTable([
      tableNode("table", [row("r1", [cell("td", "a", "A"), cell("td", "b", "B")])], [100, 140]),
    ]);

    try {
      const handle = mounted.host.querySelector('[data-column="0"]');
      if (!(handle instanceof HTMLElement)) {
        throw new Error("Missing resize handle.");
      }

      mounted.editor.tf.normalize({ force: true });
      const before = JSON.stringify(mounted.editor.children);
      const undos = mounted.editor.history.undos.length;
      await act(async () => {
        handle.dispatchEvent(
          new PointerEvent("pointerdown", { bubbles: true, clientX: 0, button: 0 }),
        );
        handle.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: 80 }));
      });
      expect(mounted.editor.history.undos.length).toBe(undos);
      expect(field(tablesOf(mounted.editor.children)[0], "colSizes")).toEqual([100, 140]);
      await act(async () => {
        handle.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, clientX: 80 }));
      });
      expect(mounted.editor.history.undos.length - undos).toBe(1);
      expect(field(tablesOf(mounted.editor.children)[0], "colSizes")).toEqual([180, 140]);
      mounted.editor.tf.undo();
      expect(JSON.stringify(mounted.editor.children)).toBe(before);

      await act(async () => {
        handle.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "ArrowRight" }));
        handle.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "ArrowRight" }));
        handle.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "ArrowRight" }));
      });
      expect(field(tablesOf(mounted.editor.children)[0], "colSizes")).toEqual([124, 140]);
      expect(mounted.editor.history.undos.length - undos).toBe(3);

      await act(async () => {
        handle.dispatchEvent(
          new PointerEvent("pointerdown", { bubbles: true, clientX: 0, button: 0 }),
        );
        handle.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: 5000 }));
        handle.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, clientX: 5000 }));
      });
      const widened = field(tablesOf(mounted.editor.children)[0], "colSizes");
      expect(Array.isArray(widened) ? widened[0] : undefined).toBe(1200);
      await act(async () => {
        handle.dispatchEvent(
          new PointerEvent("pointerdown", { bubbles: true, clientX: 0, button: 0 }),
        );
        handle.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: -5000 }));
        handle.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, clientX: -5000 }));
      });
      const narrowed = field(tablesOf(mounted.editor.children)[0], "colSizes");
      expect(Array.isArray(narrowed) ? narrowed[0] : undefined).toBe(48);

      await act(async () => {
        handle.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
      });
      expect(field(tablesOf(mounted.editor.children)[0], "colSizes")).toEqual([null, 140]);
      const other = mounted.host.querySelector('[data-column="1"]');
      if (!(other instanceof HTMLElement)) {
        throw new Error("Missing the second handle.");
      }
      await act(async () => {
        other.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
      });
      expect(field(tablesOf(mounted.editor.children)[0], "colSizes")).toBeUndefined();
    } finally {
      await mounted.cleanup();
    }
  });

  test("read-only renders widths and no handles", () => {
    const value = [tableNode("table", [row("r1", [cell("td", "a", "A")])], [160])];
    const html = renderToStaticMarkup(
      <EditorSurface
        editor={createPlateEditor({ plugins: createEditorPlugins(), value })}
        readOnly
        placeholder=""
        className="editor"
      />,
    );

    expect(html).toContain("160");
    expect(html).not.toContain('role="separator"');
    expect(html).toContain("overflow-x-auto");
  });
});

describe("table selection and paste", () => {
  test("a rectangular copy pastes into a cell and outside a table without losing text", () => {
    const editor = createEditor([
      tableNode("table", [
        row("r1", [cell("td", "a", "Alpha"), cell("td", "b", "Beta")]),
        row("r2", [cell("td", "c", "Gamma"), cell("td", "d", "Delta")]),
      ]),
    ]);
    selectCells(editor, [0, 0, 0, 0, 0], [0, 1, 1, 0, 0], 5);
    const fragment = editor.api.getFragment();
    expect(nodeText(fragment)).toContain("Alpha");
    expect(nodeText(fragment)).toContain("Delta");
    expect(JSON.stringify(fragment)).toContain('"type":"table"');

    const outside = createEditor([{ type: "p", id: "empty", children: [{ text: "" }] }]);
    outside.tf.select(caret([0, 0], 0));
    outside.tf.insertFragment(fragment);
    expect(nodeText(outside.children)).toContain("Alpha");
    expect(nodeText(outside.children)).toContain("Beta");
    expect(nodeText(outside.children)).toContain("Gamma");
    expect(nodeText(outside.children)).toContain("Delta");

    const inside = createEditor([
      tableNode("host", [row("r1", [cell("td", "host", "Host"), cell("td", "side", "Side")])]),
    ]);
    selectCell(inside, [0], 0, 0);
    inside.tf.insertFragment(fragment);
    const pasted = nodeText(tablesOf(inside.children)[0]);
    expect(pasted).toContain("Alpha");
    expect(pasted).toContain("Beta");
    expect(pasted).toContain("Gamma");
    expect(pasted).toContain("Delta");
  });

  test("TSV fills anchor cells and skips positions a span covers", () => {
    const editor = createEditor([
      tableNode("table", [
        row("r1", [cell("td", "a", "Old", { colSpan: 2 }), cell("td", "b", "B")]),
        row("r2", [cell("td", "c", "C"), cell("td", "d", "D"), cell("td", "e", "E")]),
      ]),
    ]);
    selectCell(editor, [0], 0, 0);
    pasteData(editor, "1\t2\t3");
    const texts = cellTexts(tablesOf(editor.children)[0] ?? tableNode("missing", []));

    expect(texts[0]?.[0]).toBe("1");
    expect(texts[0]?.[1]).toBe("3");
    expect(nodeText(tablesOf(editor.children)[0])).not.toContain("2");
    expect(texts[1]).toEqual(["C", "D", "E"]);
  });

  test("HTML colspan and rowspan are kept and repaired into a rectangle", () => {
    const editor = createEditor([{ type: "p", id: "empty", children: [{ text: "" }] }]);
    editor.tf.select(caret([0, 0], 0));
    pasteData(
      editor,
      undefined,
      '<table><tr><td colspan="2">Wide</td><td rowspan="2">Tall</td></tr><tr><td>Left</td></tr></table>',
    );
    const table = tablesOf(editor.children)[0] ?? tableNode("missing", []);

    expect(nodeText(table)).toContain("Wide");
    expect(nodeText(table)).toContain("Tall");
    expect(nodeText(table)).toContain("Left");
    expect(JSON.stringify(table)).toContain('"colSpan":2');
    expect(JSON.stringify(table)).toContain('"rowSpan":2');
    expect(JSON.stringify(table)).not.toContain("colspan");
  });

  test("a pixel column width is kept and a percentage or out-of-range width is dropped", () => {
    const editor = createEditor([{ type: "p", id: "empty", children: [{ text: "" }] }]);
    editor.tf.select(caret([0, 0], 0));
    pasteData(
      editor,
      undefined,
      '<table><col width="180"><col width="40%"><col width="2000"><tr><td>A</td><td>B</td><td>C</td></tr></table>',
    );
    const table = tablesOf(editor.children)[0] ?? tableNode("missing", []);

    expect(field(table, "colSizes")).toEqual([180, null, null]);
    expect(repairText(editor)).toContain("40%");
    expect(repairText(editor)).toContain("2000px");
    expect(nodeText(table)).toContain("A");

    const styled = createEditor([{ type: "p", id: "empty", children: [{ text: "" }] }]);
    styled.tf.select(caret([0, 0], 0));
    pasteData(
      styled,
      undefined,
      '<table><tr><td style="width: 200px">A</td><td style="width: 50%">B</td></tr></table>',
    );
    expect(field(tablesOf(styled.children)[0], "colSizes")).toEqual([200, null]);
    expect(repairText(styled)).toContain("50%");
  });
});
