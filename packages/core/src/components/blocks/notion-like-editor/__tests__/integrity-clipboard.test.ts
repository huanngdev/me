import { describe, expect, test } from "bun:test";
import type { Descendant, SlateEditor } from "platejs";

import { DEMO_DOCUMENT_VALUE } from "../demo/demo-document";
import { FOOTNOTE_DEF_KEY } from "../lib/document/editor-document-schema";
import type { EditorValue } from "../lib/document/editor-value";
import { plainText } from "../lib/features/editor-inline-date";
import { setBlockSelection, writeBlockFragment } from "../lib/plugins/editor-block-selection";
import {
  allTextOf,
  checkInvariants,
  cloneValue,
  collect,
  isRecordValue,
  semanticEqual,
  snapshot,
  stableJson,
  type Reference,
} from "./integrity-helpers";
import { WORST_CASE_VALUE } from "./integrity-fixtures";
import { caret, createEditor, paragraphValue, textRange } from "./test-utils";

const FRAGMENT_TYPE = "application/x-slate-fragment";

const FIXTURES: readonly { name: string; value: EditorValue }[] = [
  { name: "demo", value: DEMO_DOCUMENT_VALUE as EditorValue },
  { name: "worst", value: WORST_CASE_VALUE },
];

// Containers that keep their wrapper when pasted after a non-empty paragraph.
const WRAPPER_LOSS_TYPES: readonly string[] = [
  "blockquote",
  "callout",
  "toggle",
  "code_block",
  "column_group",
];

// Text blocks merge into the paragraph (a definition's text becomes paragraph text).
const MERGING_TYPES: readonly string[] = ["p", "h1", "h2", "h3", FOOTNOTE_DEF_KEY];

type Copied = { name: string; value: EditorValue; index: number; id: string };

// What the editor writes for a block copy, read back the way a paste reads it.
function copyBlock(value: EditorValue, id: string): { encoded: string; fragment: EditorValue } {
  const source = createEditor(cloneValue(value));
  setBlockSelection(source, [id]);
  const data = new DataTransfer();
  if (!writeBlockFragment(source, data)) {
    throw new Error(`Block ${id} could not be copied.`);
  }
  const encoded = data.getData(FRAGMENT_TYPE);
  if (encoded.length === 0) {
    throw new Error(`Block ${id} wrote no fragment.`);
  }
  return { encoded, fragment: JSON.parse(decodeURIComponent(window.atob(encoded))) as EditorValue };
}

// The text/plain the product writes for a fragment: each node's plain text, one per line.
function plainFor(fragment: EditorValue): string {
  return fragment.map((node) => plainText(node as Descendant)).join("\n");
}

function pasteData(encoded: string, plain: string): DataTransfer {
  const data = new DataTransfer();
  data.setData(FRAGMENT_TYPE, encoded);
  data.setData("text/plain", plain);
  return data;
}

function leafTexts(node: unknown, out: string[] = []): string[] {
  if (Array.isArray(node)) {
    node.forEach((child) => leafTexts(child, out));
  } else if (isRecordValue(node)) {
    if (typeof node.text === "string" && !("children" in node)) {
      if (node.text.trim().length > 0) {
        out.push(node.text.trim());
      }
    } else {
      leafTexts(node.children, out);
    }
  }
  return out;
}

// An empty paragraph with no text or references. Plate may leave these beside a pasted block.
function isPlaceholder(block: unknown): boolean {
  return (
    isRecordValue(block) &&
    block.type === "p" &&
    allTextOf(block) === "" &&
    collect(block).references.length === 0
  );
}

function containsRun(list: readonly Reference[], run: readonly Reference[]): boolean {
  if (run.length === 0) {
    return true;
  }
  for (let start = 0; start + run.length <= list.length; start += 1) {
    if (JSON.stringify(list.slice(start, start + run.length)) === JSON.stringify(run)) {
      return true;
    }
  }
  return false;
}

// Plate rewrites listStart on a decimal run as the run is pasted, so the start is derived numbering.
const DERIVED_LIST_KEYS = ["listStart"];

// Documented remap: a pasted definition takes a new id when the target already has that footnote id.
function sourceMatches(candidate: unknown, source: unknown): boolean {
  const isDefinition = isRecordValue(source) && source.type === FOOTNOTE_DEF_KEY;
  return semanticEqual(candidate, source, {
    ignoreIds: true,
    ignoreKeys: isDefinition ? [...DERIVED_LIST_KEYS, "footnoteId"] : DERIVED_LIST_KEYS,
  });
}

function expectExact(actual: unknown, expected: unknown, label: string): void {
  if (
    JSON.stringify(actual) === JSON.stringify(expected) ||
    stableJson(actual) === stableJson(expected)
  ) {
    return;
  }
  throw new Error(`${label}: documents differ.`);
}

function allBlocks(): Copied[] {
  const blocks: Copied[] = [];
  for (const fixture of FIXTURES) {
    fixture.value.forEach((block, index) => {
      blocks.push({
        name: fixture.name,
        value: fixture.value,
        index,
        id: isRecordValue(block) ? String(block.id) : "",
      });
    });
  }
  return blocks;
}

function half(part: number): Copied[] {
  const blocks = allBlocks();
  return blocks.slice(
    Math.floor((blocks.length * part) / 2),
    Math.floor((blocks.length * (part + 1)) / 2),
  );
}

// A plain paragraph in the second half of the demo: the middle-of-document paste target.
function middleParagraphIndex(): number {
  const demo = DEMO_DOCUMENT_VALUE as EditorValue;
  const found = demo.findIndex(
    (block, index) =>
      index >= Math.floor(demo.length / 2) &&
      isRecordValue(block) &&
      block.type === "p" &&
      allTextOf(block).length > 0,
  );
  if (found < 0) {
    throw new Error("The demo has no plain paragraph in its second half.");
  }
  return found;
}

describe("copy one block into an empty document", () => {
  for (const part of [0, 1]) {
    test(`every block of both fixtures pastes into an empty document with its own content only, half ${part + 1} of 2`, () => {
      for (const { name, value, index, id } of half(part)) {
        const label = `${name} block ${index} "${id}" into an empty document`;
        const copied = copyBlock(value, id);
        if (copied.fragment.length === 0) {
          throw new Error(`${label}: the fragment is empty.`);
        }

        const target = createEditor();
        const before = snapshot(target);
        target.tf.select(caret([0, 0], 0));
        target.tf.insertData(pasteData(copied.encoded, plainFor(copied.fragment)));
        checkInvariants(target, label);
        const after = snapshot(target);

        // Placeholders aside, the pasted blocks are the fragment, in order.
        const pasted = after.filter(
          (block) => !isPlaceholder(block) || copied.fragment.some((node) => isPlaceholder(node)),
        );
        if (pasted.length !== copied.fragment.length) {
          throw new Error(
            `${label}: ${pasted.length} blocks were pasted, expected ${copied.fragment.length}.`,
          );
        }
        copied.fragment.forEach((node, position) => {
          if (!sourceMatches(pasted[position], node)) {
            throw new Error(`${label}: pasted block ${position} differs from the copied block.`);
          }
        });

        target.tf.undo();
        expectExact(snapshot(target), before, `${label}: undo`);
      }
    });
  }

  // DEFECT (unsure whether intended): a table pasted into an empty paragraph keeps that paragraph and adds
  // another after the table. The paste should leave the table as the only block.
  test.failing("a table pasted into an empty document is the only block", () => {
    const value = DEMO_DOCUMENT_VALUE as EditorValue;
    const table = value.find((block) => isRecordValue(block) && block.type === "table");
    if (!isRecordValue(table) || typeof table.id !== "string") {
      throw new Error("The demo has no table.");
    }
    const copied = copyBlock(value, table.id);

    const target = createEditor();
    target.tf.select(caret([0, 0], 0));
    target.tf.insertData(pasteData(copied.encoded, plainFor(copied.fragment)));
    expect(snapshot(target).length).toBe(1);
  });
});

describe("copy one block to the end of a paragraph in the middle of the demo", () => {
  for (const part of [0, 1]) {
    test(`every block of both fixtures pastes after the middle paragraph with its text, references and marks, half ${part + 1} of 2`, () => {
      const paragraph = middleParagraphIndex();

      for (const { name, value, index, id } of half(part)) {
        const label = `${name} block ${index} "${id}" after the middle paragraph`;
        const copied = copyBlock(value, id);
        const target = createEditor(cloneValue(DEMO_DOCUMENT_VALUE) as EditorValue);
        const before = snapshot(target);
        target.tf.select(target.api.end([paragraph]) ?? caret([paragraph, 0], 0));
        target.tf.insertData(pasteData(copied.encoded, plainFor(copied.fragment)));
        checkInvariants(target, label);
        const after = snapshot(target);

        const sourceText = copied.fragment.map((node) => allTextOf(node)).join("");
        if (!allTextOf(after).includes(sourceText)) {
          throw new Error(`${label}: the pasted text is missing from the document.`);
        }
        // A definition that merges keeps its text, not its footnote id, so that key is not expected.
        const firstType = isRecordValue(copied.fragment[0]) ? copied.fragment[0].type : undefined;
        const expectedReferences = collect(copied.fragment).references.filter(
          (reference) =>
            !(
              firstType === FOOTNOTE_DEF_KEY &&
              copied.fragment.length === 1 &&
              reference.key === "footnoteId"
            ),
        );
        if (!containsRun(collect(after).references, expectedReferences)) {
          throw new Error(`${label}: a pasted reference is missing or changed.`);
        }
        const sourceMarks = collect(copied.fragment).marks;
        for (const [key, count] of Object.entries(sourceMarks)) {
          const gained = (collect(after).marks[key] ?? 0) - (collect(before).marks[key] ?? 0);
          if (gained < count) {
            throw new Error(`${label}: the mark ${key} was lost on paste.`);
          }
        }

        // A single text block may merge into the paragraph. Any other block must be inserted as itself.
        const first = copied.fragment[0];
        const mergesText =
          copied.fragment.length === 1 &&
          isRecordValue(first) &&
          MERGING_TYPES.includes(String(first.type));
        if (!mergesText && !after.some((block) => sourceMatches(block, first))) {
          throw new Error(`${label}: the copied block is not in the document as itself.`);
        }

        target.tf.undo();
        expectExact(snapshot(target), before, `${label}: undo`);
      }
    });
  }

  // A column group pasted after a paragraph keeps its columns and normalizes.
  test("the demo column group pastes after a paragraph of the demo document", () => {
    const copied = copyBlock(DEMO_DOCUMENT_VALUE as EditorValue, "demo-column-group");
    const paragraph = middleParagraphIndex();
    const target = createEditor(cloneValue(DEMO_DOCUMENT_VALUE) as EditorValue);
    target.tf.select(target.api.end([paragraph]) ?? caret([paragraph, 0], 0));
    target.tf.insertData(pasteData(copied.encoded, plainFor(copied.fragment)));
    checkInvariants(target, "demo column group pasted into the demo document");
  });

  // A container pasted after a non-empty paragraph keeps its wrapper.
  test("containers keep their wrapper when pasted after a paragraph", () => {
    const paragraph = middleParagraphIndex();
    for (const { name, value, id, index } of allBlocks()) {
      const block = value[index];
      if (!isRecordValue(block) || !WRAPPER_LOSS_TYPES.includes(String(block.type))) {
        continue;
      }
      const copied = copyBlock(value, id);
      const target = createEditor(cloneValue(DEMO_DOCUMENT_VALUE) as EditorValue);
      const countBefore = snapshot(target).filter((item) =>
        sourceMatches(item, copied.fragment[0]),
      ).length;
      target.tf.select(target.api.end([paragraph]) ?? caret([paragraph, 0], 0));
      target.tf.insertData(pasteData(copied.encoded, plainFor(copied.fragment)));
      const countAfter = snapshot(target).filter((item) =>
        sourceMatches(item, copied.fragment[0]),
      ).length;
      if (countAfter <= countBefore) {
        throw new Error(
          `${name} ${String(block.type)} "${id}" was not kept as a ${String(block.type)}.`,
        );
      }
    }
  });

  // A code block pasted after a paragraph keeps its lines inside the code block.
  test("a code block pasted after a paragraph keeps its lines inside the code block", () => {
    const copied = copyBlock(DEMO_DOCUMENT_VALUE as EditorValue, "demo-code-ts");
    const paragraph = middleParagraphIndex();
    const target = createEditor(cloneValue(DEMO_DOCUMENT_VALUE) as EditorValue);
    target.tf.select(target.api.end([paragraph]) ?? caret([paragraph, 0], 0));
    target.tf.insertData(pasteData(copied.encoded, plainFor(copied.fragment)));
    const orphans = snapshot(target).filter(
      (block) => isRecordValue(block) && block.type === "code_line",
    );
    expect(orphans.length).toBe(0);
  });
});

describe("plain text of a block copy", () => {
  test("every block's plain text contains every visible text run of that block", () => {
    for (const { name, value, index, id } of allBlocks()) {
      const label = `${name} block ${index} "${id}" plain text`;
      const copied = copyBlock(value, id);
      const plain = plainFor(copied.fragment);
      for (const run of leafTexts(value[index])) {
        if (!plain.includes(run)) {
          throw new Error(`${label}: the plain text does not contain "${run}".`);
        }
      }
    }
  });
});

describe("copy the whole document", () => {
  for (const fixture of FIXTURES) {
    test(`${fixture.name} copied whole pastes into an empty document with the same text and counts`, () => {
      const source = createEditor(cloneValue(fixture.value));
      const last = source.children.length - 1;
      const start = source.api.start([0]);
      const end = source.api.end([last]);
      if (start === undefined || end === undefined) {
        throw new Error(`${fixture.name}: the document has no start or end point.`);
      }
      source.tf.select({ anchor: start, focus: end });
      const fragment = source.api.getFragment() as EditorValue;
      const encoded = window.btoa(encodeURIComponent(JSON.stringify(fragment)));

      const target = createEditor();
      target.tf.select(caret([0, 0], 0));
      target.tf.insertData(pasteData(encoded, plainFor(fragment)));
      checkInvariants(target, `${fixture.name} whole copy`);
      const after = snapshot(target);

      expect(allTextOf(after)).toBe(allTextOf(fixture.value));
      const counted = collect(after);
      const expected = collect(fixture.value);
      expect(counted.types).toEqual(expected.types);
      expect(counted.marks).toEqual(expected.marks);
      expect(counted.references).toEqual(expected.references);
    });
  }
});

function blockTypes(value: EditorValue): string[] {
  return value.map((block) => (isRecordValue(block) ? String(block.type) : "?"));
}

function blockIdOf(value: EditorValue, type: string): string {
  const found = value.find((block) => isRecordValue(block) && block.type === type);
  if (!isRecordValue(found) || typeof found.id !== "string") {
    throw new Error(`The demo has no ${type} block with an id.`);
  }
  return found.id;
}

// The first paragraph inside the first top-level block of the given type.
function firstParagraphPathIn(editor: SlateEditor, type: string): number[] {
  const top = editor.children.findIndex((block) => isRecordValue(block) && block.type === type);
  if (top < 0) {
    throw new Error(`The demo has no ${type} block.`);
  }
  for (const [, path] of editor.api.nodes({ at: [top], match: { type: "p" } })) {
    return path;
  }
  throw new Error(`The first ${type} block has no paragraph.`);
}

describe("paste a callout at a caret in a text block", () => {
  test("a callout pasted at the start of a non-empty paragraph goes before the paragraph", () => {
    const copied = copyBlock(DEMO_DOCUMENT_VALUE as EditorValue, "demo-callout");
    const target = createEditor(paragraphValue("hello world", "p-1"));
    const before = snapshot(target);
    target.tf.select(caret([0, 0], 0));
    target.tf.insertData(pasteData(copied.encoded, plainFor(copied.fragment)));
    checkInvariants(target, "callout at the start");
    const after = snapshot(target);

    expect(blockTypes(after)).toEqual(["callout", "p"]);
    expect(allTextOf(after[1])).toBe("hello world");
    target.tf.undo();
    expectExact(snapshot(target), before, "callout at the start: undo");
  });

  test("a callout pasted in the middle of a paragraph splits it around the callout", () => {
    const copied = copyBlock(DEMO_DOCUMENT_VALUE as EditorValue, "demo-callout");
    const target = createEditor(paragraphValue("hello world", "p-1"));
    const before = snapshot(target);
    target.tf.select(caret([0, 0], 5));
    target.tf.insertData(pasteData(copied.encoded, plainFor(copied.fragment)));
    checkInvariants(target, "callout in the middle");
    const after = snapshot(target);

    expect(blockTypes(after)).toEqual(["p", "callout", "p"]);
    expect(allTextOf(after[0])).toBe("hello");
    expect(allTextOf(after[2])).toBe(" world");
    target.tf.undo();
    expectExact(snapshot(target), before, "callout in the middle: undo");
  });

  test("a callout pasted over an expanded selection replaces the selected text", () => {
    const copied = copyBlock(DEMO_DOCUMENT_VALUE as EditorValue, "demo-callout");
    const target = createEditor(paragraphValue("hello world", "p-1"));
    const before = snapshot(target);
    target.tf.select(textRange([0, 0], 6, 11));
    target.tf.insertData(pasteData(copied.encoded, plainFor(copied.fragment)));
    checkInvariants(target, "callout over a selection");
    const after = snapshot(target);

    expect(blockTypes(after)).toEqual(["p", "callout"]);
    expect(allTextOf(after[0])).toBe("hello ");
    target.tf.undo();
    expectExact(snapshot(target), before, "callout over a selection: undo");
  });

  // The editor's normalizers decide where the callout ends up in these four places.
  for (const [label, type] of [
    ["a callout", "callout"],
    ["a toggle", "toggle"],
    ["a table cell", "table"],
    ["a column", "column_group"],
  ] as const) {
    test(`a callout pasted at the end of a paragraph inside ${label} passes the invariants`, () => {
      const copied = copyBlock(DEMO_DOCUMENT_VALUE as EditorValue, "demo-callout");
      const target = createEditor(cloneValue(DEMO_DOCUMENT_VALUE) as EditorValue);
      const before = snapshot(target);
      target.tf.select(target.api.end(firstParagraphPathIn(target, type)) ?? caret([0, 0], 0));
      target.tf.insertData(pasteData(copied.encoded, plainFor(copied.fragment)));
      checkInvariants(target, `callout at the end of a paragraph inside ${label}`);

      target.tf.undo();
      expectExact(snapshot(target), before, `callout inside ${label}: undo`);
    });
  }

  test("a fragment that starts with a paragraph still merges that paragraph at the end of a paragraph", () => {
    const callout = copyBlock(DEMO_DOCUMENT_VALUE as EditorValue, "demo-callout").fragment[0];
    const fragment = [{ type: "p", id: "p-x", children: [{ text: "x" }] }, callout] as EditorValue;
    const encoded = window.btoa(encodeURIComponent(JSON.stringify(fragment)));
    const target = createEditor(paragraphValue("hello world", "p-1"));
    const before = snapshot(target);
    target.tf.select(caret([0, 0], 11));
    target.tf.insertData(pasteData(encoded, plainFor(fragment)));
    checkInvariants(target, "paragraph and callout at the end");
    const after = snapshot(target);

    expect(blockTypes(after)).toEqual(["p", "callout"]);
    expect(allTextOf(after[0])).toBe("hello worldx");
    target.tf.undo();
    expectExact(snapshot(target), before, "paragraph and callout at the end: undo");
  });

  test("a divider pasted at the end of a non-empty paragraph goes after the paragraph", () => {
    const copied = copyBlock(
      DEMO_DOCUMENT_VALUE as EditorValue,
      blockIdOf(DEMO_DOCUMENT_VALUE as EditorValue, "hr"),
    );
    const target = createEditor(paragraphValue("hello world", "p-1"));
    const before = snapshot(target);
    target.tf.select(caret([0, 0], 11));
    target.tf.insertData(pasteData(copied.encoded, plainFor(copied.fragment)));
    checkInvariants(target, "divider at the end");
    const after = snapshot(target);

    expect(blockTypes(after)).toEqual(["p", "hr"]);
    expect(allTextOf(after[0])).toBe("hello world");
    target.tf.undo();
    expectExact(snapshot(target), before, "divider at the end: undo");
  });
});
