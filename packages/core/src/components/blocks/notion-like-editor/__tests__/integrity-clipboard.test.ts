import { describe, expect, test } from "bun:test";
import type { Descendant } from "platejs";

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
import { caret, createEditor } from "./test-utils";

const FRAGMENT_TYPE = "application/x-slate-fragment";

const FIXTURES: readonly { name: string; value: EditorValue }[] = [
  { name: "demo", value: DEMO_DOCUMENT_VALUE as EditorValue },
  { name: "worst", value: WORST_CASE_VALUE },
];

// Containers that lose their wrapper when pasted after a non-empty paragraph. The test.failing
// blocks below show each case. The loop skips these types so the other blocks still run.
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
        const sourceType = value[index];
        if (isRecordValue(sourceType) && WRAPPER_LOSS_TYPES.includes(String(sourceType.type))) {
          continue;
        }

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

  // DEFECT: pasting the demo column group after a paragraph of the demo document throws Plate's
  // "Could not completely normalize the editor after 294 iterations". The same paste into a small
  // document works. In the demo, the trigger appears once the target holds at least 11 callouts.
  test.failing("the demo column group pastes after a paragraph of the demo document", () => {
    const copied = copyBlock(DEMO_DOCUMENT_VALUE as EditorValue, "demo-column-group");
    const paragraph = middleParagraphIndex();
    const target = createEditor(cloneValue(DEMO_DOCUMENT_VALUE) as EditorValue);
    target.tf.select(target.api.end([paragraph]) ?? caret([paragraph, 0], 0));
    target.tf.insertData(pasteData(copied.encoded, plainFor(copied.fragment)));
    checkInvariants(target, "demo column group pasted into the demo document");
  });

  // DEFECT: a container (blockquote, callout, toggle, code block, column group) pasted after a non-empty
  // paragraph loses its wrapper. Its first child merges into the paragraph, the other children become
  // top-level blocks, and no repair is reported. This is the same for every container in the demo.
  test.failing("containers keep their wrapper when pasted after a paragraph", () => {
    const paragraph = middleParagraphIndex();
    for (const { name, value, id, index } of allBlocks()) {
      const block = value[index];
      if (!isRecordValue(block) || !WRAPPER_LOSS_TYPES.includes(String(block.type))) {
        continue;
      }
      if (name === "demo" && id === "demo-column-group") {
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

  // DEFECT: a code block pasted after a paragraph leaves its lines outside the code block, as top-level
  // code_line blocks. The validator accepts those (see the round-trip edge cases), so the result looks valid.
  test.failing(
    "a code block pasted after a paragraph keeps its lines inside the code block",
    () => {
      const copied = copyBlock(DEMO_DOCUMENT_VALUE as EditorValue, "demo-code-ts");
      const paragraph = middleParagraphIndex();
      const target = createEditor(cloneValue(DEMO_DOCUMENT_VALUE) as EditorValue);
      target.tf.select(target.api.end([paragraph]) ?? caret([paragraph, 0], 0));
      target.tf.insertData(pasteData(copied.encoded, plainFor(copied.fragment)));
      const orphans = snapshot(target).filter(
        (block) => isRecordValue(block) && block.type === "code_line",
      );
      expect(orphans.length).toBe(0);
    },
  );
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
