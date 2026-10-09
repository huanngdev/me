import { describe, expect, test } from "bun:test";
import { type SlateEditor, type TElement } from "platejs";
import { createPlateEditor } from "platejs/react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";

import { getBlockType, runEditorCommand } from "../lib/commands/editor-commands";
import {
  deleteTable,
  deleteTableColumn,
  deleteTableRow,
  insertTable,
  insertTableColumn,
  insertTableRow,
  toggleTableHeaderColumn,
  toggleTableHeaderRow,
} from "../lib/commands/editor-table-commands";
import { createEditorDocument } from "../lib/document/editor-document";
import {
  allowedChildTypes,
  TABLE_MAX_COLUMNS,
  TABLE_MAX_ROWS,
} from "../lib/document/editor-document-schema";
import { parseEditorDocument, type ParseResult } from "../lib/document/editor-document-validate";
import { pasteRepairsOf } from "../lib/paste/editor-paste";
import { createEditorPlugins } from "../lib/plugins/editor-plugins";
import { EditorSurface } from "../components/editor/editor-surface";
import { createTableNode, pastedTableTruncationMessage } from "../lib/features/editor-table";
import type { EditorValue } from "../lib/document/editor-value";
import {
  caret,
  createEditor,
  expectInvalid,
  expectOk,
  expectUnsupported,
  field,
  isRecord,
} from "./test-utils";

function paragraph(
  text: string,
  id: string,
  attrs?: Record<string, unknown>,
  marks?: Record<string, boolean>,
): TElement {
  return {
    type: "p",
    id,
    ...attrs,
    children: [marks === undefined ? { text } : { text, ...marks }],
  };
}

function cell(kind: "td" | "th", id: string, children: TElement[] | string): TElement {
  return {
    type: kind,
    id,
    children: typeof children === "string" ? [paragraph(children, `${id}-p`)] : children,
  };
}

function row(id: string, cells: TElement[]): TElement {
  return { type: "tr", id, children: cells };
}

function tableNode(id: string, rows: TElement[]): TElement {
  return { type: "table", id, children: rows };
}

function gridTable(rows: number, cols: number, id = "table-1"): TElement {
  const body: TElement[] = [];
  for (let rowIndex = 0; rowIndex < rows; rowIndex += 1) {
    const cells: TElement[] = [];
    for (let columnIndex = 0; columnIndex < cols; columnIndex += 1) {
      cells.push(cell("td", `${id}-r${rowIndex}c${columnIndex}`, `${rowIndex}:${columnIndex}`));
    }
    body.push(row(`${id}-r${rowIndex}`, cells));
  }

  return tableNode(id, body);
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

function elementTypes(node: unknown, found: string[] = []): string[] {
  if (!isElement(node)) {
    return found;
  }

  found.push(node.type);
  for (const child of node.children) {
    elementTypes(child, found);
  }

  return found;
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

function cellGrid(table: TElement): Array<Array<{ type: string; text: string; id: unknown }>> {
  return table.children.filter(isElement).map((tableRow) =>
    tableRow.children.filter(isElement).map((tableCell) => ({
      type: tableCell.type,
      text: nodeText(tableCell),
      id: field(tableCell, "id"),
    })),
  );
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
  offset = 0,
): void {
  editor.tf.select(caret([...path, rowIndex, columnIndex, 0, 0], offset));
}

function open(value: EditorValue): SlateEditor {
  const editor = createEditor(value);
  editor.tf.normalize({ force: true });
  return editor;
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

function renderTable(value: EditorValue, readOnly = false): string {
  const editor = createPlateEditor({
    plugins: createEditorPlugins(),
    value,
  });

  return renderToStaticMarkup(
    <EditorSurface editor={editor} readOnly={readOnly} placeholder="" className="editor" />,
  );
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

const sample = tableNode("table-1", [
  row("row-1", [cell("th", "h1", "A"), cell("th", "h2", "B")]),
  row("row-2", [
    cell("th", "c1", [
      paragraph("one", "c1-a"),
      paragraph("two", "c1-b", { align: "center", lineHeight: 1.5 }),
    ]),
    cell("td", "c2", [
      paragraph("item", "c2-p", { indent: 1, listStyleType: "disc" }, { bold: true }),
    ]),
  ]),
]);

describe("table schema", () => {
  test("a table round-trips with a header row, a header column, paragraphs, and a list", () => {
    expect(allowedChildTypes("table")).toEqual(["tr"]);
    expect(allowedChildTypes("tr")).toEqual(["td", "th"]);
    expect(allowedChildTypes("td")).toEqual(["p"]);
    expect(allowedChildTypes("th")).toEqual(["p"]);
    expect(allowedChildTypes("toggle")).toContain("table");

    const parsed = expectOk(documentOf([sample, paragraph("after", "after")]));

    expect(parsed.repairs).toEqual([]);
    expect(parsed.document.content).toEqual([sample, paragraph("after", "after")]);
  });

  test("an empty table is invalid", () => {
    const result = expectInvalid(documentOf([tableNode("table-1", [])]));

    expect(issues(result)).toContain("has no children");
  });

  test("51 rows and 21 columns are unsupported", () => {
    const rows = expectUnsupported(documentOf([gridTable(TABLE_MAX_ROWS + 1, 1)]));
    const columns = expectUnsupported(documentOf([gridTable(1, TABLE_MAX_COLUMNS + 1)]));

    expect(issues(rows)).toContain("51 children");
    expect(issues(rows)).toContain("At most 50");
    expect(issues(columns)).toContain("21 children");
    expect(issues(columns)).toContain("At most 20");
  });

  test("a nested table, a non-paragraph cell, and inline cell children are unsupported", () => {
    const nested = expectUnsupported(
      documentOf([
        tableNode("outer", [
          row("row-1", [
            cell("td", "cell-1", [
              tableNode("inner", [row("inner-row", [cell("td", "inner-cell", "kept")])]),
            ]),
          ]),
        ]),
      ]),
    );
    const heading = expectUnsupported(
      documentOf([
        tableNode("table-1", [
          row("row-1", [
            cell("td", "cell-1", [{ type: "h1", id: "h", children: [{ text: "No" }] }]),
          ]),
        ]),
      ]),
    );
    const inline = expectUnsupported(
      documentOf([
        tableNode("table-1", [
          row("row-1", [{ type: "td", id: "cell-1", children: [{ text: "inline" }] }]),
        ]),
      ]),
    );

    expect(issues(nested)).toContain('unsupported child type "table"');
    expect(issues(heading)).toContain('unsupported child type "h1"');
    expect(issues(inline)).toContain("inline children");
  });

  test("a span that defines the grid and an in-range colSizes round-trip", () => {
    const spanned = tableNode("table-1", [
      row("row-1", [{ ...cell("td", "cell-1", "A"), colSpan: 2 }, cell("td", "cell-2", "B")]),
    ]);
    const sized = {
      ...tableNode("table-2", [row("row-2", [cell("td", "sized-a", "A")])]),
      colSizes: [120],
    };
    const parsed = expectOk(documentOf([spanned, sized]));

    expect(parsed.repairs).toEqual([]);
    expect(JSON.stringify(parsed.document.content[0])).toContain('"colSpan":2');
    expect(field(parsed.document.content[1], "colSizes")).toEqual([120]);
  });
});

describe("table normalizer", () => {
  test("ragged rows become a rectangle and a top-level table keeps a following paragraph", () => {
    const editor = open([
      tableNode("table-1", [
        row("row-1", [cell("td", "a", "A"), cell("td", "b", "B")]),
        row("row-2", [cell("td", "c", "C")]),
      ]),
    ]);
    const grid = cellGrid(tablesOf(editor.children)[0] ?? tableNode("missing", []));

    expect(grid.map((tableRow) => tableRow.map((tableCell) => tableCell.text))).toEqual([
      ["A", "B"],
      ["C", ""],
    ]);
    expect(editor.children.map((block) => (isElement(block) ? block.type : ""))).toEqual([
      "table",
      "p",
    ]);
  });

  test("a nested table flattens into paragraphs and keeps the text", () => {
    const editor = open([
      tableNode("outer", [
        row("row-1", [
          cell("td", "cell-1", [
            paragraph("before", "before"),
            tableNode("inner", [
              row("inner-row", [
                cell("td", "inner-cell", "kept"),
                cell("th", "inner-head", "head"),
              ]),
            ]),
          ]),
        ]),
      ]),
    ]);
    const table = tablesOf(editor.children)[0];

    expect(tablesOf(editor.children)).toHaveLength(1);
    expect(nodeText(table)).toContain("before");
    expect(nodeText(table)).toContain("kept");
    expect(nodeText(table)).toContain("head");
    expect(elementTypes(table).filter((type) => type === "table")).toEqual(["table"]);
  });

  test("a table inside a quote or a callout becomes one paragraph per cell", () => {
    const inner = tableNode("table-1", [
      row("row-1", [cell("td", "a", "One"), cell("td", "b", "Two")]),
    ]);
    const quote = open([{ type: "blockquote", id: "quote-1", children: [inner] }]);
    const callout = open([
      { type: "callout", id: "callout-1", children: [structuredClone(inner)] },
    ]);

    expect(tablesOf(quote.children)).toEqual([]);
    expect(tablesOf(callout.children)).toEqual([]);
    expect(nodeText(quote.children[0])).toContain("One");
    expect(nodeText(quote.children[0])).toContain("Two");
    expect(quote.children[0]?.children.filter(isElement).map((child) => child.type)).toEqual([
      "p",
      "p",
    ]);
    expect(nodeText(callout.children[0])).toContain("One");
    expect(callout.children[0]?.children.filter(isElement).map((child) => child.type)).toEqual([
      "p",
      "p",
    ]);
  });

  test("a table inside a toggle stays a table", () => {
    const editor = open([
      {
        type: "toggle",
        id: "toggle-1",
        children: [paragraph("Label", "label"), gridTable(1, 2, "inner")],
      },
    ]);
    const toggle = editor.children[0];

    expect(isElement(toggle) && toggle.type).toBe("toggle");
    expect(tablesOf(editor.children)).toHaveLength(1);
    expect(
      cellGrid(tablesOf(editor.children)[0] ?? tableNode("missing", []))[0]?.map(
        (tableCell) => tableCell.text,
      ),
    ).toEqual(["0:0", "0:1"]);
  });
});

describe("table commands", () => {
  test("insertTable replaces an empty paragraph, clamps, and leaves the caret in the first cell", () => {
    const editor = createEditor([paragraph("", "empty")]);
    const before = JSON.stringify(editor.children);
    editor.tf.select(caret([0, 0], 0));

    expect(insertTable.id).toBe("block.insert.table");
    expect(insertTable.label).toBe("Table");
    expect(insertTable.group).toBe("insert");
    expect(editor.meta.shortcuts["block.insert.table"]).toBeUndefined();
    expect(runEditorCommand(editor, insertTable, undefined)).toBe(true);

    const inserted = tablesOf(editor.children)[0];
    expect(
      cellGrid(inserted ?? tableNode("missing", [])).map((tableRow) => tableRow.length),
    ).toEqual([3, 3, 3]);
    expect(editor.children.map((block) => (isElement(block) ? block.type : ""))).toEqual([
      "table",
      "p",
    ]);
    expect(editor.selection?.anchor.path.slice(0, 3)).toEqual([0, 0, 0]);

    editor.tf.undo();
    expect(JSON.stringify(editor.children)).toBe(before);

    editor.tf.select(caret([0, 0], 0));
    runEditorCommand(editor, insertTable, { rows: 0, cols: 2.5 });
    expect(
      cellGrid(tablesOf(editor.children)[0] ?? tableNode("missing", [])).map(
        (tableRow) => tableRow.length,
      ),
    ).toEqual([3]);

    editor.tf.undo();
    editor.tf.select(caret([0, 0], 0));
    runEditorCommand(editor, insertTable, { rows: 80, cols: 40 });
    const clamped = cellGrid(tablesOf(editor.children)[0] ?? tableNode("missing", []));
    expect(clamped).toHaveLength(TABLE_MAX_ROWS);
    expect(clamped[0]).toHaveLength(TABLE_MAX_COLUMNS);
  });

  test("insertTable after a non-empty paragraph keeps that paragraph and adds one after the table", () => {
    const editor = createEditor([paragraph("Hello", "hello")]);
    editor.tf.select(caret([0, 0], 5));

    expect(runEditorCommand(editor, insertTable, { rows: 1, cols: 1 })).toBe(true);
    expect(editor.children.map((block) => (isElement(block) ? block.type : ""))).toEqual([
      "p",
      "table",
      "p",
    ]);
    expect(nodeText(editor.children[0])).toBe("Hello");
    expect(editor.selection?.anchor.path.slice(0, 3)).toEqual([1, 0, 0]);
  });

  test("row and column commands edit the current cell and each one undoes in one step", () => {
    const editor = createEditor([
      tableNode("table-1", [
        row("row-1", [cell("td", "a", "A"), cell("td", "b", "B")]),
        row("row-2", [cell("td", "c", "C"), cell("td", "d", "D")]),
      ]),
      paragraph("after", "after"),
    ]);
    selectCell(editor, [0], 0, 0);
    const beforeRow = JSON.stringify(editor.children);

    expect(insertTableRow.id).toBe("block.table.insert-row");
    expect(runEditorCommand(editor, insertTableRow, { before: true })).toBe(true);
    expect(
      cellGrid(tablesOf(editor.children)[0] ?? tableNode("missing", [])).map((tableRow) =>
        tableRow.map((item) => item.text),
      ),
    ).toEqual([
      ["", ""],
      ["A", "B"],
      ["C", "D"],
    ]);
    editor.tf.undo();
    expect(JSON.stringify(editor.children)).toBe(beforeRow);

    selectCell(editor, [0], 0, 0);
    const beforeAfter = JSON.stringify(editor.children);
    runEditorCommand(editor, insertTableRow, { before: false });
    expect(
      cellGrid(tablesOf(editor.children)[0] ?? tableNode("missing", [])).map((tableRow) =>
        tableRow.map((item) => item.text),
      )[1],
    ).toEqual(["", ""]);
    editor.tf.undo();
    expect(JSON.stringify(editor.children)).toBe(beforeAfter);

    selectCell(editor, [0], 0, 1);
    const beforeColumn = JSON.stringify(editor.children);
    expect(insertTableColumn.id).toBe("block.table.insert-column");
    runEditorCommand(editor, insertTableColumn, { before: true });
    expect(
      cellGrid(tablesOf(editor.children)[0] ?? tableNode("missing", []))[0]?.map(
        (item) => item.text,
      ),
    ).toEqual(["A", "", "B"]);
    editor.tf.undo();
    expect(JSON.stringify(editor.children)).toBe(beforeColumn);

    selectCell(editor, [0], 1, 0);
    const beforeDeleteRow = JSON.stringify(editor.children);
    expect(deleteTableRow.id).toBe("block.table.delete-row");
    runEditorCommand(editor, deleteTableRow, undefined);
    expect(
      cellGrid(tablesOf(editor.children)[0] ?? tableNode("missing", [])).map((tableRow) =>
        tableRow.map((item) => item.text),
      ),
    ).toEqual([["A", "B"]]);
    editor.tf.undo();
    expect(JSON.stringify(editor.children)).toBe(beforeDeleteRow);

    selectCell(editor, [0], 0, 0);
    const beforeDeleteColumn = JSON.stringify(editor.children);
    expect(deleteTableColumn.id).toBe("block.table.delete-column");
    runEditorCommand(editor, deleteTableColumn, undefined);
    expect(
      cellGrid(tablesOf(editor.children)[0] ?? tableNode("missing", [])).map((tableRow) =>
        tableRow.map((item) => item.text),
      ),
    ).toEqual([["B"], ["D"]]);
    editor.tf.undo();
    expect(JSON.stringify(editor.children)).toBe(beforeDeleteColumn);
  });

  test("deleting the last row or column removes the table and leaves a paragraph", () => {
    const lastRow = open([
      tableNode("table-1", [row("row-1", [cell("td", "a", "A"), cell("td", "b", "B")])]),
    ]);
    selectCell(lastRow, [0], 0, 0);
    const rowIds = idsOf(tablesOf(lastRow.children)[0] ?? tableNode("missing", []));
    const beforeRow = JSON.stringify(lastRow.children);

    runEditorCommand(lastRow, deleteTableRow, undefined);
    expect(tablesOf(lastRow.children)).toEqual([]);
    expect(lastRow.children.some((block) => isElement(block) && block.type === "p")).toBe(true);
    lastRow.tf.undo();
    expect(JSON.stringify(lastRow.children)).toBe(beforeRow);
    expect(idsOf(tablesOf(lastRow.children)[0] ?? tableNode("missing", []))).toEqual(rowIds);

    const lastColumn = open([
      tableNode("table-1", [
        row("row-1", [cell("td", "a", "A")]),
        row("row-2", [cell("td", "c", "C")]),
      ]),
    ]);
    selectCell(lastColumn, [0], 0, 0);
    const beforeColumn = JSON.stringify(lastColumn.children);
    runEditorCommand(lastColumn, deleteTableColumn, undefined);
    expect(tablesOf(lastColumn.children)).toEqual([]);
    expect(isElement(lastColumn.children[0]) && lastColumn.children[0].type).toBe("p");
    lastColumn.tf.undo();
    expect(JSON.stringify(lastColumn.children)).toBe(beforeColumn);
  });

  test("deleteTable replaces the table with an empty paragraph and one undo restores the ids", () => {
    const editor = open([
      paragraph("before", "before"),
      tableNode("table-1", [row("row-1", [cell("td", "a", "A")])]),
    ]);
    selectCell(editor, [1], 0, 0);
    const before = JSON.stringify(editor.children);

    expect(deleteTable.id).toBe("block.table.delete");
    expect(runEditorCommand(editor, deleteTable, undefined)).toBe(true);
    expect(tablesOf(editor.children)).toEqual([]);
    expect(nodeText(editor.children[0])).toBe("before");
    expect(nodeText(editor.children[1])).toBe("");
    expect(editor.selection?.anchor.path[0]).toBe(1);

    editor.tf.undo();
    expect(JSON.stringify(editor.children)).toBe(before);
  });

  test("header toggles convert the first row or column and keep content and ids", () => {
    const editor = open([
      tableNode("table-1", [
        row("row-1", [cell("td", "a", "A"), cell("td", "b", "B")]),
        row("row-2", [cell("th", "c", "C"), cell("td", "d", "D")]),
      ]),
    ]);
    selectCell(editor, [0], 1, 1);
    const before = JSON.stringify(editor.children);

    expect(toggleTableHeaderRow.id).toBe("block.table.header-row");
    expect(toggleTableHeaderRow.group).toBe("format");
    runEditorCommand(editor, toggleTableHeaderRow, undefined);
    expect(
      cellGrid(tablesOf(editor.children)[0] ?? tableNode("missing", [])).map((tableRow) =>
        tableRow.map((item) => item.type),
      ),
    ).toEqual([
      ["th", "th"],
      ["th", "td"],
    ]);
    expect(
      cellGrid(tablesOf(editor.children)[0] ?? tableNode("missing", []))[0]?.map((item) => item.id),
    ).toEqual(["a", "b"]);
    editor.tf.undo();
    expect(JSON.stringify(editor.children)).toBe(before);

    selectCell(editor, [0], 0, 1);
    runEditorCommand(editor, toggleTableHeaderRow, undefined);
    runEditorCommand(editor, toggleTableHeaderRow, undefined);
    expect(
      cellGrid(tablesOf(editor.children)[0] ?? tableNode("missing", []))[0]?.map(
        (item) => item.type,
      ),
    ).toEqual(["td", "td"]);

    const column = open([
      tableNode("table-1", [
        row("row-1", [cell("td", "a", "A"), cell("th", "b", "B")]),
        row("row-2", [cell("td", "c", "C"), cell("td", "d", "D")]),
      ]),
    ]);
    selectCell(column, [0], 0, 1);
    const beforeColumn = JSON.stringify(column.children);
    expect(toggleTableHeaderColumn.id).toBe("block.table.header-column");
    runEditorCommand(column, toggleTableHeaderColumn, undefined);
    expect(
      cellGrid(tablesOf(column.children)[0] ?? tableNode("missing", [])).map(
        (tableRow) => tableRow[0]?.type,
      ),
    ).toEqual(["th", "th"]);
    expect(
      cellGrid(tablesOf(column.children)[0] ?? tableNode("missing", [])).map(
        (tableRow) => tableRow[0]?.id,
      ),
    ).toEqual(["a", "c"]);
    column.tf.undo();
    expect(JSON.stringify(column.children)).toBe(beforeColumn);
  });

  test("row and column inserts stop at the cap", () => {
    const rows = createEditor([createTableNode(TABLE_MAX_ROWS, 1)]);
    selectCell(rows, [0], 0, 0);
    const beforeRows = JSON.stringify(rows.children);
    expect(runEditorCommand(rows, insertTableRow, undefined)).toBe(true);
    expect(JSON.stringify(rows.children)).toBe(beforeRows);

    const columns = createEditor([createTableNode(1, TABLE_MAX_COLUMNS)]);
    selectCell(columns, [0], 0, 0);
    const beforeColumns = JSON.stringify(columns.children);
    expect(runEditorCommand(columns, insertTableColumn, undefined)).toBe(true);
    expect(JSON.stringify(columns.children)).toBe(beforeColumns);
  });

  test("table commands refuse a read-only editor and a selection outside a table", () => {
    const editor = createEditor([paragraph("Hello", "hello")]);
    editor.tf.select(caret([0, 0], 0));
    const before = JSON.stringify(editor.children);

    expect(runEditorCommand(editor, insertTable, { rows: 1, cols: 1 }, { readOnly: true })).toBe(
      false,
    );
    expect(runEditorCommand(editor, insertTableRow, undefined)).toBe(false);
    expect(JSON.stringify(editor.children)).toBe(before);

    const inside = createEditor([tableNode("table-1", [row("row-1", [cell("td", "a", "A")])])]);
    selectCell(inside, [0], 0, 0);
    inside.dom.readOnly = true;
    const beforeInside = JSON.stringify(inside.children);

    expect(insertTable.isEnabled?.(inside)).toBe(false);
    expect(deleteTable.isEnabled?.(inside)).toBe(false);
    expect(runEditorCommand(inside, deleteTable, undefined)).toBe(false);
    expect(JSON.stringify(inside.children)).toBe(beforeInside);
  });
});

describe("table block type", () => {
  test("a paragraph in a cell reports table and a list item reports its list", () => {
    const editor = createEditor([sample]);
    selectCell(editor, [0], 1, 0, 1);
    expect(getBlockType(editor)).toBe("table");

    editor.tf.select(caret([0, 1, 1, 0, 0], 1));
    expect(getBlockType(editor)).toBe("bulleted-list");
  });
});

describe("table keyboard", () => {
  test("tab and shift+tab move between cells, and tab outside a table stays put", () => {
    const editor = createEditor([
      paragraph("outside", "outside"),
      tableNode("table-1", [
        row("row-1", [cell("td", "a", "A"), cell("td", "b", "B")]),
        row("row-2", [cell("td", "c", "C"), cell("td", "d", "D")]),
      ]),
    ]);
    selectCell(editor, [1], 0, 0);
    expect(editor.tf.tab({ reverse: false })).toBe(true);
    expect(editor.selection?.anchor.path.slice(0, 4)).toEqual([1, 0, 1, 0]);

    expect(editor.tf.tab({ reverse: true })).toBe(true);
    expect(editor.selection?.anchor.path.slice(0, 4)).toEqual([1, 0, 0, 0]);

    editor.tf.select(caret([0, 0], 0));
    expect(editor.tf.tab({ reverse: false })).toBe(false);
    expect(nodeText(editor.children[0])).toBe("outside");
    expect(field(editor.children[0], "indent")).toBeUndefined();
  });

  test("tab in the last cell appends a row until the row cap", () => {
    const editor = createEditor([
      tableNode("table-1", [row("row-1", [cell("td", "a", "A"), cell("td", "b", "B")])]),
    ]);
    selectCell(editor, [0], 0, 1);
    expect(editor.tf.tab({ reverse: false })).toBe(true);
    expect(cellGrid(tablesOf(editor.children)[0] ?? tableNode("missing", []))).toHaveLength(2);
    expect(editor.selection?.anchor.path.slice(0, 4)).toEqual([0, 1, 0, 0]);

    const capped = createEditor([createTableNode(TABLE_MAX_ROWS, 1)]);
    selectCell(capped, [0], TABLE_MAX_ROWS - 1, 0);
    expect(capped.tf.tab({ reverse: false })).toBe(true);
    expect(tablesOf(capped.children)[0]?.children).toHaveLength(TABLE_MAX_ROWS);
  });

  test("tab on a fully selected last cell appends a row", () => {
    const editor = createEditor([
      tableNode("table-1", [row("row-1", [cell("td", "a", "A"), cell("td", "b", "B")])]),
    ]);
    editor.tf.select([0, 0, 1]);
    expect(editor.api.isExpanded()).toBe(true);
    expect(editor.tf.tab({ reverse: false })).toBe(true);
    expect(cellGrid(tablesOf(editor.children)[0] ?? tableNode("missing", []))).toHaveLength(2);
    expect(editor.selection?.anchor.path.slice(0, 4)).toEqual([0, 1, 0, 0]);
  });

  test("tab on a selection that spans two cells does not append a row", () => {
    const editor = createEditor([
      tableNode("table-1", [row("row-1", [cell("td", "a", "A"), cell("td", "b", "B")])]),
    ]);
    editor.tf.select({
      anchor: { path: [0, 0, 0, 0, 0], offset: 0 },
      focus: { path: [0, 0, 1, 0, 0], offset: 1 },
    });
    expect(editor.tf.tab({ reverse: false })).toBe(true);
    expect(cellGrid(tablesOf(editor.children)[0] ?? tableNode("missing", []))).toHaveLength(1);
  });

  test("tab on a list item inside a cell moves to the next cell", () => {
    const editor = createEditor([
      tableNode("table-1", [
        row("row-1", [
          cell("td", "a", [paragraph("item", "item", { indent: 1, listStyleType: "disc" })]),
          cell("td", "b", "Next"),
        ]),
      ]),
    ]);
    selectCell(editor, [0], 0, 0);
    expect(editor.tf.tab({ reverse: false })).toBe(true);
    expect(editor.selection?.anchor.path.slice(0, 4)).toEqual([0, 0, 1, 0]);
    expect(field(tablesOf(editor.children)[0]?.children[0], "indent")).toBeUndefined();
    const list = tablesOf(editor.children)[0]?.children[0];
    const listCell = isElement(list) ? list.children[0] : undefined;
    const listParagraph = isElement(listCell) ? listCell.children[0] : undefined;
    expect(field(listParagraph, "indent")).toBe(1);
    expect(field(listParagraph, "listStyleType")).toBe("disc");
  });

  test("arrow down leaves the last row and arrow up leaves the first row", () => {
    const editor = createEditor([
      paragraph("before", "before"),
      tableNode("table-1", [
        row("row-1", [cell("td", "a", "A")]),
        row("row-2", [cell("td", "b", "B")]),
      ]),
      paragraph("after", "after"),
    ]);
    selectCell(editor, [1], 1, 0, 1);
    expect(editor.tf.moveLine({ reverse: false })).toBe(true);
    expect(editor.selection?.anchor.path[0]).toBe(2);

    selectCell(editor, [1], 0, 0);
    expect(editor.tf.moveLine({ reverse: true })).toBe(true);
    expect(editor.selection?.anchor.path[0]).toBe(0);
  });

  test("enter adds a paragraph in the cell and shift+enter adds a soft break", () => {
    const editor = createEditor([tableNode("table-1", [row("row-1", [cell("td", "a", "Hello")])])]);
    selectCell(editor, [0], 0, 0, 2);
    editor.tf.insertBreak();
    const table = tablesOf(editor.children)[0];
    const tableCell = isElement(table?.children[0]) ? table.children[0].children[0] : undefined;
    expect(
      isElement(tableCell)
        ? tableCell.children.filter(isElement).map((child) => nodeText(child))
        : [],
    ).toEqual(["He", "llo"]);

    const soft = createEditor([tableNode("table-1", [row("row-1", [cell("td", "a", "Hello")])])]);
    selectCell(soft, [0], 0, 0, 2);
    soft.tf.insertSoftBreak();
    expect(nodeText(tablesOf(soft.children)[0])).toBe("He\nllo");
    expect(cellGrid(tablesOf(soft.children)[0] ?? tableNode("missing", []))).toHaveLength(1);
  });

  test("backspace at the start of a cell does not merge cells or delete the table", () => {
    const editor = createEditor([
      tableNode("table-1", [row("row-1", [cell("td", "a", "A"), cell("td", "b", "Hello")])]),
    ]);
    selectCell(editor, [0], 0, 1, 0);
    editor.tf.deleteBackward();
    expect(nodeText(tablesOf(editor.children)[0])).toBe("AHello");
    expect(cellGrid(tablesOf(editor.children)[0] ?? tableNode("missing", []))).toHaveLength(1);

    selectCell(editor, [0], 0, 1, 1);
    editor.tf.deleteBackward();
    expect(
      cellGrid(tablesOf(editor.children)[0] ?? tableNode("missing", []))[0]?.map(
        (item) => item.text,
      ),
    ).toEqual(["A", "ello"]);
  });

  test("deleting the whole table or a range across it leaves a paragraph and one undo restores the ids", () => {
    const selected = createEditor([
      paragraph("before", "before"),
      tableNode("table-1", [row("row-1", [cell("td", "a", "A"), cell("td", "b", "B")])]),
      paragraph("after", "after"),
    ]);
    selectCell(selected, [1], 0, 0);
    selected.tf.selectAll();
    const beforeSelected = JSON.stringify(selected.children);
    selected.tf.deleteFragment();
    expect(tablesOf(selected.children)).toEqual([]);
    expect(selected.children.some((block) => isElement(block) && block.type === "p")).toBe(true);
    selected.tf.undo();
    expect(JSON.stringify(selected.children)).toBe(beforeSelected);

    const spanning = createEditor([
      paragraph("before", "before"),
      tableNode("table-1", [row("row-1", [cell("td", "a", "Kept")])]),
      paragraph("after", "after"),
    ]);
    const beforeSpanning = JSON.stringify(spanning.children);
    spanning.tf.select({
      anchor: { path: [0, 0], offset: 0 },
      focus: { path: [2, 0], offset: 5 },
    });
    spanning.tf.deleteFragment();
    expect(tablesOf(spanning.children)).toEqual([]);
    expect(spanning.children.some((block) => isElement(block) && block.type === "p")).toBe(true);
    spanning.tf.undo();
    expect(JSON.stringify(spanning.children)).toBe(beforeSpanning);
  });

  test("break above at the start of a cell inserts the paragraph inside the cell", () => {
    const editor = createEditor([
      paragraph("before", "before"),
      tableNode("table-1", [row("row-1", [cell("td", "a", "Hello")])]),
      paragraph("after", "after"),
    ]);
    selectCell(editor, [1], 0, 0, 0);
    editor.tf.insertBreak();
    const table = tablesOf(editor.children)[0];
    const tableCell = isElement(table?.children[0]) ? table.children[0].children[0] : undefined;
    const texts = isElement(tableCell)
      ? tableCell.children.filter(isElement).map((child) => nodeText(child))
      : [];

    expect(editor.children.map((block) => (isElement(block) ? block.type : ""))).toEqual([
      "p",
      "table",
      "p",
    ]);
    expect(texts).toEqual(["", "Hello"]);
  });
});

describe("table paste", () => {
  test("an HTML table keeps headers, marks, breaks, and cell text while dropping spans", () => {
    const editor = createEditor([paragraph("", "empty")]);
    editor.tf.select(caret([0, 0], 0));
    pasteData(
      editor,
      "Name\tNote",
      '<table><thead><tr><th>Name</th><th>Note</th></tr></thead><tbody><tr><td>Ada<br>Lovelace</td><td><strong>Bold</strong></td></tr><tr><td colspan="2">Merged</td></tr></tbody></table>',
    );
    const table = tablesOf(editor.children)[0];
    const grid = cellGrid(table ?? tableNode("missing", []));

    expect(grid[0]?.map((item) => item.type)).toEqual(["th", "th"]);
    expect(grid[0]?.map((item) => item.text)).toEqual(["Name", "Note"]);
    expect(nodeText(table)).toContain("Ada");
    expect(nodeText(table)).toContain("Lovelace");
    expect(nodeText(table)).toContain("Bold");
    expect(nodeText(table)).toContain("Merged");
    expect(JSON.stringify(table)).toContain('"colSpan":2');
    expect(JSON.stringify(table)).not.toContain("colspan");
    expect(grid[2]).toHaveLength(1);
    const bold = JSON.stringify(table);
    expect(bold).toContain('"bold":true');
  });

  test("an HTML table past the cap keeps the first 50 by 20 and reports the truncation", () => {
    const rows = Array.from({ length: TABLE_MAX_ROWS + 1 }, (_, rowIndex) => {
      const cells = Array.from(
        { length: TABLE_MAX_COLUMNS + 1 },
        (_, columnIndex) => `<td>${rowIndex}:${columnIndex}</td>`,
      ).join("");
      return `<tr>${cells}</tr>`;
    }).join("");
    const editor = createEditor([paragraph("", "empty")]);
    editor.tf.select(caret([0, 0], 0));
    pasteData(editor, undefined, `<table>${rows}</table>`);
    const grid = cellGrid(tablesOf(editor.children)[0] ?? tableNode("missing", []));

    expect(grid).toHaveLength(TABLE_MAX_ROWS);
    expect(grid[0]).toHaveLength(TABLE_MAX_COLUMNS);
    expect(grid[0]?.[0]?.text).toBe("0:0");
    expect(pasteRepairsOf(editor).map((repair) => repair.message)).toEqual([
      pastedTableTruncationMessage(),
    ]);
  });

  test("TSV inside a cell fills from the caret and TSV outside stays text", () => {
    const inside = createEditor([tableNode("table-1", [row("row-1", [cell("td", "a", "old")])])]);
    selectCell(inside, [0], 0, 0, 3);
    pasteData(inside, "A\tB\nC\tD");
    expect(
      cellGrid(tablesOf(inside.children)[0] ?? tableNode("missing", [])).map((tableRow) =>
        tableRow.map((item) => item.text),
      ),
    ).toEqual([
      ["A", "B"],
      ["C", "D"],
    ]);
    expect(pasteRepairsOf(inside)).toEqual([]);

    // createSlateEditor leaves insertData unimplemented. The Plate editor installs
    // the clipboard handler that inserts plain text, which is what the page uses.
    const outside = createPlateEditor({
      plugins: createEditorPlugins(),
      value: [paragraph("Hello", "hello")],
    });
    outside.tf.select(caret([0, 0], 5));
    pasteData(outside, "A\tB\nC\tD");
    expect(tablesOf(outside.children)).toEqual([]);
    expect(nodeText(outside.children[0])).toContain("A");
    expect(nodeText(outside.children[0])).toContain("\t");

    const plain = createPlateEditor({
      plugins: createEditorPlugins(),
      value: [tableNode("table-1", [row("row-1", [cell("td", "a", "Hello")])])],
    });
    selectCell(plain, [0], 0, 0, 5);
    pasteData(plain, " world");
    expect(
      cellGrid(tablesOf(plain.children)[0] ?? tableNode("missing", []))[0]?.map(
        (item) => item.text,
      ),
    ).toEqual(["Hello world"]);
  });

  test("TSV that would pass the cap reports the dropped cells", () => {
    const lines = Array.from({ length: TABLE_MAX_ROWS + 2 }, (_, index) => `${index}\tx`).join(
      "\n",
    );
    const editor = createEditor([tableNode("table-1", [row("row-1", [cell("td", "a", "old")])])]);
    selectCell(editor, [0], 0, 0);
    pasteData(editor, lines);
    const grid = cellGrid(tablesOf(editor.children)[0] ?? tableNode("missing", []));

    expect(grid).toHaveLength(TABLE_MAX_ROWS);
    expect(grid[0]).toHaveLength(2);
    expect(grid[0]?.[0]?.text).toBe("0");
    expect(grid[0]?.[1]?.text).toBe("x");
    expect(grid[TABLE_MAX_ROWS - 1]?.[0]?.text).toBe(String(TABLE_MAX_ROWS - 1));
    expect(pasteRepairsOf(editor).map((repair) => repair.message)).toEqual([
      pastedTableTruncationMessage(),
    ]);
  });

  test("an editor fragment keeps headers and replaces a colliding id", () => {
    const fragment = tableNode("same", [
      row("row-1", [cell("th", "head", "Name"), cell("td", "body", "Ada")]),
    ]);
    const editor = createEditor([paragraph("Already", "same")]);
    editor.tf.select(caret([0, 0], 7));
    editor.tf.insertFragment([fragment]);
    const table = tablesOf(editor.children)[0] ?? tableNode("missing", []);
    const tableId = field(table, "id");

    expect(cellGrid(table)[0]?.map((item) => item.type)).toEqual(["th", "td"]);
    expect(nodeText(table)).toContain("Name");
    expect(field(editor.children[0], "id")).toBe("same");
    expect(typeof tableId).toBe("string");
    expect(tableId).not.toBe("same");
    // The sanitizer omits the colliding table id. NodeId assigns the replacement
    // during normalize, so the non-colliding row and cell ids stay put.
    expect(idsOf(table).slice(1)).toEqual(["row-1", "head", "head-p", "body", "body-p"]);
    const liveIds = idsOf(editor.children);
    expect(new Set(liveIds).size).toBe(liveIds.length);

    const parsed = expectOk(documentOf(editor.children));
    expect(parsed.repairs).toEqual([]);
    expect(nodeText(tablesOf(parsed.document.content)[0])).toContain("Name");
  });

  test("a nested HTML table flattens and keeps both texts", () => {
    const editor = createEditor([paragraph("", "empty")]);
    editor.tf.select(caret([0, 0], 0));
    pasteData(
      editor,
      undefined,
      "<table><tr><td>Outer<table><tr><td>Inner</td></tr></table></td></tr></table>",
    );

    expect(tablesOf(editor.children)).toHaveLength(1);
    expect(nodeText(tablesOf(editor.children)[0])).toContain("Outer");
    expect(nodeText(tablesOf(editor.children)[0])).toContain("Inner");
  });

  test("a later paste replaces the truncation report", () => {
    const editor = createEditor([paragraph("", "empty")]);
    editor.tf.select(caret([0, 0], 0));
    const wide = `<table><tr>${Array.from({ length: TABLE_MAX_COLUMNS + 1 }, () => "<td>x</td>").join("")}</tr></table>`;
    pasteData(editor, undefined, wide);
    expect(pasteRepairsOf(editor)).toHaveLength(1);

    const tableIndex = editor.children.findIndex(
      (block) => isElement(block) && block.type === "table",
    );
    selectCell(editor, [tableIndex], 0, 0);
    pasteData(editor, undefined, "<table><tr><td>Only</td></tr></table>");
    expect(pasteRepairsOf(editor)).toEqual([]);
  });
});

describe("table render", () => {
  test("the table is semantic, scrolls horizontally, and hides its controls while read-only", () => {
    const html = renderTable([sample]);

    expect(html).toContain("<table");
    expect(html).toContain("<tbody");
    expect(html).toContain("<tr");
    expect(html).toContain("<th");
    expect(html).toContain("<td");
    expect(html).toContain("overflow-x-auto");
    expect(html).toContain("min-w-12");
    expect(html).toContain("var(--editor-table-border)");
    expect(html).toContain("var(--editor-table-header-bg)");
    expect(html).toContain('contentEditable="false"');
    expect(html).toContain("Table options");

    const readOnly = renderTable([sample], true);
    expect(readOnly).toContain("<th");
    expect(readOnly).not.toContain("Table options");
    expect(readOnly).not.toContain('role="separator"');
  });

  test("a multi-cell selection marks the selected cells", async () => {
    const mounted = await mountTable([
      tableNode("table-1", [row("row-1", [cell("td", "a", "Alpha"), cell("td", "b", "Beta")])]),
    ]);

    try {
      await act(async () => {
        mounted.editor.tf.select({
          anchor: { path: [0, 0, 0, 0, 0], offset: 0 },
          focus: { path: [0, 0, 1, 0, 0], offset: 4 },
        });
      });
      await act(async () => {
        await Promise.resolve();
      });

      expect(mounted.host.querySelectorAll(".editor-table-cell-selected").length).toBeGreaterThan(
        1,
      );
    } finally {
      await mounted.cleanup();
    }
  });
});

describe("table performance", () => {
  test("inserting a 50 by 20 table and typing in the last cell", () => {
    const editor = createEditor([paragraph("", "empty")]);
    editor.tf.select(caret([0, 0], 0));
    const insertStarted = performance.now();
    runEditorCommand(editor, insertTable, { rows: TABLE_MAX_ROWS, cols: TABLE_MAX_COLUMNS });
    const insertMs = performance.now() - insertStarted;
    selectCell(editor, [0], TABLE_MAX_ROWS - 1, TABLE_MAX_COLUMNS - 1);
    const typeStarted = performance.now();
    editor.tf.insertText("x");
    editor.tf.normalize({ force: true });
    const typeMs = performance.now() - typeStarted;

    console.warn(
      `table benchmark: insert ${TABLE_MAX_ROWS}x${TABLE_MAX_COLUMNS} ${insertMs.toFixed(1)} ms, last-cell keystroke ${typeMs.toFixed(1)} ms`,
    );
    expect(cellGrid(tablesOf(editor.children)[0] ?? tableNode("missing", []))).toHaveLength(
      TABLE_MAX_ROWS,
    );
    expect(nodeText(tablesOf(editor.children)[0])).toContain("x");
  });
});
