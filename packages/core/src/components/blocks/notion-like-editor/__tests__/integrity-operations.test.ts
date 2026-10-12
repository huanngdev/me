import { describe, expect, test } from "bun:test";
import type { SlateEditor } from "platejs";

import { DEMO_DOCUMENT_VALUE } from "../demo/demo-document";
import {
  deleteBlock,
  duplicateBlock,
  formatBold,
  formatCode,
  formatItalic,
  formatKeyboard,
  formatStrikethrough,
  formatSubscript,
  formatSuperscript,
  formatUnderline,
  moveBlock,
  runEditorCommand,
  setFontFamily,
  setFontSize,
  setHighlight,
  setTextColor,
  turnBlockInto,
  type EditorCommand,
} from "../lib/commands/editor-commands";
import { siblingMove } from "../lib/features/editor-block-drop";
import {
  blockMenuDecisions,
  currentBlockMenuKind,
  menuBlockView,
  type BlockMenuKind,
} from "../lib/features/editor-block-menu";
import { isFootnoteId } from "../lib/features/editor-footnote-id";
import { FOOTNOTE_DEF_KEY, FOOTNOTE_REF_KEY } from "../lib/document/editor-document-schema";
import type { EditorValue } from "../lib/document/editor-value";
import {
  allElementIds,
  allTextOf,
  checkInvariants,
  cloneValue,
  collect,
  describeDifference,
  isRecordValue,
  semanticEqual,
  snapshot,
  stableJson,
} from "./integrity-helpers";
import { WORST_CASE_VALUE } from "./integrity-fixtures";
import { createEditor } from "./test-utils";

type Block = Record<string, unknown>;

// Plate rewrites listStart on a decimal run when an item moves or is removed, so the visible
// numbers stay right. That rewrite is derived numbering, not an edit to the other blocks.
const DERIVED_LIST_KEYS: readonly string[] = ["listStart"];

const TEXT_BLOCK_TYPES: readonly string[] = ["p", "h1", "h2", "h3"];

// Marks that a command removes from the range, by design (see the command comments in editor-commands.ts).
const INLINE_VOID_TYPES: readonly string[] = [
  "mention",
  "date",
  "inline_equation",
  FOOTNOTE_REF_KEY,
];

const FIXTURES: readonly { name: string; value: EditorValue }[] = [
  { name: "demo", value: DEMO_DOCUMENT_VALUE as EditorValue },
  { name: "worst", value: WORST_CASE_VALUE },
];

function fixtureNamed(name: string): EditorValue {
  const fixture = FIXTURES.find((item) => item.name === name);
  if (fixture === undefined) {
    throw new Error(`No fixture named ${name}.`);
  }
  return fixture.value;
}

function blockLabel(name: string, index: number, block: unknown): string {
  const record = isRecordValue(block) ? block : {};
  return `${name} block ${index} "${String(record.id)}" (${String(record.type)})`;
}

function blockAt(value: EditorValue, index: number): Block {
  const block = value[index];
  if (!isRecordValue(block)) {
    throw new Error(`No top-level block at index ${index}.`);
  }
  return block;
}

function indexesOf(value: EditorValue, type: string): number[] {
  const indexes: number[] = [];
  value.forEach((block, index) => {
    if (isRecordValue(block) && block.type === type) {
      indexes.push(index);
    }
  });
  return indexes;
}

function containsType(node: unknown, types: readonly string[]): boolean {
  if (Array.isArray(node)) {
    return node.some((child) => containsType(child, types));
  }
  if (!isRecordValue(node)) {
    return false;
  }
  if (typeof node.type === "string" && types.includes(node.type)) {
    return true;
  }
  return containsType(node.children, types);
}

// Exact content and key order: undo must put back what was there.
function expectExact(actual: unknown, expected: unknown, label: string): void {
  if (
    JSON.stringify(actual) === JSON.stringify(expected) ||
    stableJson(actual) === stableJson(expected)
  ) {
    return;
  }

  throw new Error(`${label}: documents differ. ${describeDifference(expected, actual)}`);
}

// Same content, ignoring key order and ids. Text runs with the same marks are one run.
function expectSameContent(
  actual: unknown,
  expected: unknown,
  label: string,
  options: { ignoreIds: boolean; ignoreKeys?: readonly string[] },
): void {
  if (semanticEqual(actual, expected, options)) {
    return;
  }

  throw new Error(`${label}: content differs. ${describeDifference(expected, actual)}`);
}

function freshEditor(value: EditorValue): SlateEditor {
  return createEditor(cloneValue(value));
}

// Undoes every recorded step, then checks the document is the one that was there before them.
function undoBackTo(editor: SlateEditor, before: EditorValue, label: string): void {
  while (editor.history.undos.length > 0) {
    editor.tf.undo();
  }
  expectExact(snapshot(editor), before, `${label}: undoing every step`);
}

// Mark counts, inline element counts and references: what an operation must keep.
function inlineSignature(value: unknown): string {
  const collected = collect(value);
  const inline: Record<string, number> = {};
  for (const type of ["a", "mention", "inline_equation", "date", FOOTNOTE_REF_KEY]) {
    inline[type] = collected.types[type] ?? 0;
  }
  return JSON.stringify({ marks: collected.marks, inline, references: collected.references });
}

// Removes every inline reference to one footnote, at any depth.
function removeReferences(value: unknown, footnoteId: unknown): unknown {
  if (Array.isArray(value)) {
    return value
      .filter(
        (child) =>
          !(
            isRecordValue(child) &&
            child.type === FOOTNOTE_REF_KEY &&
            child.footnoteId === footnoteId
          ),
      )
      .map((child) => removeReferences(child, footnoteId));
  }

  if (!isRecordValue(value) || !("children" in value)) {
    return value;
  }

  return { ...value, children: removeReferences(value.children, footnoteId) };
}

describe("duplicate", () => {
  for (const name of ["demo", "worst"]) {
    test(`every ${name} block duplicates into an equal copy with fresh ids, and undo and redo restore both states`, () => {
      const value = fixtureNamed(name);
      for (let index = 0; index < value.length; index += 1) {
        duplicateOne(name, value, index);
      }
    });
  }
});

function duplicateOne(name: string, value: EditorValue, index: number): void {
  const label = blockLabel(name, index, value[index]);
  const editor = freshEditor(value);
  const before = snapshot(editor);
  const original = blockAt(before, index);

  expect(runEditorCommand(editor, duplicateBlock, { path: [index] })).toBe(true);
  checkInvariants(editor, `${label} duplicated`);
  const after = snapshot(editor);

  if (after.length !== before.length + 1) {
    throw new Error(`${label}: expected ${before.length + 1} blocks, got ${after.length}.`);
  }

  expectExact(after[index], before[index], `${label}: the original changed`);
  const copy = blockAt(after, index + 1);

  // Documented exception: a copied definition takes a fresh footnote id, so the two stay unique.
  const isDefinition = original.type === FOOTNOTE_DEF_KEY;
  if (isDefinition) {
    if (copy.footnoteId === original.footnoteId) {
      throw new Error(
        `${label}: the copied definition kept footnote id ${String(original.footnoteId)}.`,
      );
    }
    if (!isFootnoteId(copy.footnoteId)) {
      throw new Error(`${label}: the copied definition has no valid footnote id.`);
    }
  }

  expectSameContent(copy, original, `${label}: the copy`, {
    ignoreIds: true,
    ignoreKeys: isDefinition ? [...DERIVED_LIST_KEYS, "footnoteId"] : DERIVED_LIST_KEYS,
  });

  const previousIds = new Set(allElementIds(before));
  for (const id of allElementIds(copy)) {
    if (previousIds.has(id)) {
      throw new Error(`${label}: the copy reused the id "${id}".`);
    }
  }

  const rest = [...after.slice(0, index + 1), ...after.slice(index + 2)];
  expectExact(rest, before, `${label}: another block changed`);

  editor.tf.undo();
  expectExact(snapshot(editor), before, `${label}: undo after duplicate`);
  editor.tf.redo();
  expectExact(snapshot(editor), after, `${label}: redo after duplicate`);
}

describe("move up and down", () => {
  for (const name of ["demo", "worst"]) {
    test(`every ${name} block moves one step up or down, or the move is refused and nothing changes`, () => {
      const value = fixtureNamed(name);
      for (let index = 0; index < value.length; index += 1) {
        moveOne(name, value, index);
      }
    });
  }

  test("a column group cannot move into a toggle, and the document stays unchanged", () => {
    for (const fixture of FIXTURES) {
      const groupIndex = indexesOf(fixture.value, "column_group")[0];
      const toggleIndex = indexesOf(fixture.value, "toggle")[0];
      if (groupIndex === undefined || toggleIndex === undefined) {
        throw new Error(`${fixture.name}: the fixture needs a column group and a toggle.`);
      }

      const editor = freshEditor(fixture.value);
      const before = snapshot(editor);
      runEditorCommand(editor, moveBlock, { from: [groupIndex], to: [toggleIndex, 1] });
      expectExact(snapshot(editor), before, `${fixture.name}: column group moved into a toggle`);
    }
  });
});

function moveOne(name: string, value: EditorValue, index: number): void {
  const label = blockLabel(name, index, value[index]);
  const editor = freshEditor(value);
  const before = snapshot(editor);

  for (const direction of ["up", "down"] as const) {
    const step = siblingMove(editor.children, [index], direction);
    if (!step.ok) {
      runEditorCommand(editor, moveBlock, { from: [index], to: [index] });
      expectExact(
        snapshot(editor),
        before,
        `${label}: refused move ${direction} changed the document`,
      );
      continue;
    }

    runEditorCommand(editor, moveBlock, { from: [index], to: step.to });
    checkInvariants(editor, `${label} moved ${direction}`);
    const after = snapshot(editor);

    const sortedBefore = before.map((block) => stableJson(block)).sort();
    const sortedAfter = after.map((block) => stableJson(block)).sort();
    if (sortedAfter.length !== sortedBefore.length) {
      throw new Error(`${label}: moving ${direction} changed the number of blocks.`);
    }
    // Each block must still be there. Only derived list numbers may differ.
    for (const block of before) {
      const match = after.find((candidate) => candidate.id === block.id);
      if (match === undefined) {
        throw new Error(`${label}: moving ${direction} lost block "${String(block.id)}".`);
      }
      expectSameContent(
        match,
        block,
        `${label}: moving ${direction} changed block "${String(block.id)}"`,
        {
          ignoreIds: false,
          ignoreKeys: DERIVED_LIST_KEYS,
        },
      );
    }

    if (stableJson(after) === stableJson(before)) {
      throw new Error(`${label}: moving ${direction} did not change the order.`);
    }

    editor.tf.undo();
    expectExact(snapshot(editor), before, `${label}: undo after moving ${direction}`);
    editor.tf.redo();
    expectExact(snapshot(editor), after, `${label}: redo after moving ${direction}`);
    editor.tf.undo();
  }
}

describe("delete", () => {
  for (const name of ["demo", "worst"]) {
    test(`every ${name} block deletes, and undo restores exactly`, () => {
      const value = fixtureNamed(name);
      for (let index = 0; index < value.length; index += 1) {
        deleteOne(name, value, index);
      }
    });
  }
});

function deleteOne(name: string, value: EditorValue, index: number): void {
  const label = blockLabel(name, index, value[index]);
  const editor = freshEditor(value);
  const before = snapshot(editor);
  const block = blockAt(before, index);

  runEditorCommand(editor, deleteBlock, { path: [index] });
  checkInvariants(editor, `${label} deleted`);
  const after = snapshot(editor);

  // Deleting a definition from the block menu also removes its references (documented in deleteBlock).
  const rest = before.filter((_, position) => position !== index);
  const expected =
    block.type === FOOTNOTE_DEF_KEY ? removeReferences(rest, block.footnoteId) : rest;
  expectSameContent(after, expected, `${label}: deleting the block`, {
    ignoreIds: false,
    ignoreKeys: DERIVED_LIST_KEYS,
  });

  editor.tf.undo();
  expectExact(snapshot(editor), before, `${label}: undo after delete`);
  editor.tf.redo();
  expectExact(snapshot(editor), after, `${label}: redo after delete`);
}

describe("footnote definition delete", () => {
  test("deleting a footnote definition from the block menu removes its references too, and undo restores both", () => {
    for (const fixture of FIXTURES) {
      for (const index of indexesOf(fixture.value, FOOTNOTE_DEF_KEY)) {
        const label = blockLabel(fixture.name, index, fixture.value[index]);
        const editor = freshEditor(fixture.value);
        const before = snapshot(editor);
        const footnoteId = blockAt(before, index).footnoteId;

        runEditorCommand(editor, deleteBlock, { path: [index] });
        checkInvariants(editor, `${label} deleted`);
        const after = snapshot(editor);

        const expected = removeReferences(
          before.filter((_, position) => position !== index),
          footnoteId,
        );
        expectSameContent(after, expected, `${label}: deleting the definition`, {
          ignoreIds: false,
          ignoreKeys: DERIVED_LIST_KEYS,
        });
        if (stableJson(after).includes(`"footnoteId":${JSON.stringify(footnoteId)}`)) {
          throw new Error(`${label}: a block still points at footnote ${String(footnoteId)}.`);
        }

        editor.tf.undo();
        expectExact(snapshot(editor), before, `${label}: undo after deleting the definition`);
      }
    }
  });
});

describe("marks on the whole block", () => {
  // Each toggle is applied to the whole block and then removed. Value marks use their clear token.
  const TOGGLES: readonly MarkToggle[] = [
    markToggle("bold", formatBold, []),
    markToggle("italic", formatItalic, []),
    markToggle("underline", formatUnderline, []),
    markToggle("strikethrough", formatStrikethrough, []),
    markToggle("code", formatCode, ["kbd"]),
    markToggle("superscript", formatSuperscript, ["subscript"]),
    markToggle("subscript", formatSubscript, ["superscript"]),
    markToggle("kbd", formatKeyboard, ["code"]),
    valueToggle("color", setTextColor, "blue"),
    valueToggle("backgroundColor", setHighlight, "yellow"),
    valueToggle("fontSize", setFontSize, "18px"),
    valueToggle("fontFamily", setFontFamily, "mono"),
  ];

  // Each text block takes three toggles, rotating through the list, so every mark runs on several
  // blocks. Running all twelve on every block would take longer than the suite's budget.
  for (const name of ["demo", "worst"]) {
    for (const part of [0, 1]) {
      test(`${name} text blocks without inline elements take each mark on and off and equal the original (part ${part + 1} of 2)`, () => {
        marksFor(
          name,
          fixtureNamed(name),
          TOGGLES,
          (block) => !containsType(block, INLINE_VOID_TYPES),
          part,
        );
      });
    }
  }

  // A mark never lands on the empty text leaf of an inline void, so the document stays valid.
  for (const name of ["demo", "worst"]) {
    test(`${name} text blocks with inline elements take each mark on and off and stay valid`, () => {
      marksFor(
        name,
        fixtureNamed(name),
        TOGGLES,
        (block) => containsType(block, INLINE_VOID_TYPES),
        0,
        12,
      );
    });
  }

  // Bold across a mention leaves the mention's empty text leaf unmarked.
  test("bold across a mention keeps the document valid", () => {
    const editor = createEditor([
      {
        type: "p",
        id: "mark-mention",
        children: [
          { text: "a" },
          {
            type: "mention",
            id: "mark-mention-node",
            entityType: "person",
            entityId: "p1",
            label: "Al",
            children: [{ text: "" }],
          },
          { text: "b" },
        ],
      },
    ] as unknown as EditorValue);
    editor.tf.select({ anchor: { path: [0, 0], offset: 0 }, focus: { path: [0, 2], offset: 1 } });

    runEditorCommand(editor, formatBold, undefined);
    checkInvariants(editor, "bold across a mention");
  });
});

type MarkToggle = {
  key: string;
  /** Marks this command removes from the range when it adds the mark. */
  excludes: readonly string[];
  /** A mark command toggles on the selection. A value mark is set, then cleared with null. */
  kind: "mark" | "value";
  on: (editor: SlateEditor) => boolean;
  off: (editor: SlateEditor) => boolean;
};

function markToggle(key: string, command: EditorCommand, excludes: readonly string[]): MarkToggle {
  // A mark command toggles: a mixed or unmarked range gets the mark, a fully marked one loses it.
  return {
    key,
    excludes,
    kind: "mark",
    on: (editor) => runEditorCommand(editor, command, undefined),
    off: (editor) => runEditorCommand(editor, command, undefined),
  };
}

function valueToggle<T extends string>(
  key: string,
  command: EditorCommand<T | null>,
  token: T,
): MarkToggle {
  return {
    key,
    excludes: [],
    kind: "value",
    on: (editor) => runEditorCommand(editor, command, token),
    off: (editor) => runEditorCommand(editor, command, null),
  };
}

function withoutIndex(value: readonly unknown[], index: number): unknown[] {
  return [...value.slice(0, index), ...value.slice(index + 1)];
}

function textLeaves(node: unknown, out: Block[] = []): Block[] {
  if (Array.isArray(node)) {
    node.forEach((child) => textLeaves(child, out));
  } else if (isRecordValue(node)) {
    if (typeof node.text === "string" && !("children" in node)) {
      if (node.text.length > 0) {
        out.push(node);
      }
    } else {
      textLeaves(node.children, out);
    }
  }
  return out;
}

function stripMark(node: unknown, key: string): unknown {
  if (Array.isArray(node)) {
    return node.map((child) => stripMark(child, key));
  }
  if (!isRecordValue(node)) {
    return node;
  }
  const copy: Block = {};
  for (const field of Object.keys(node)) {
    if (field === key && typeof node.text === "string" && !("children" in node)) {
      continue;
    }
    copy[field] = field === "children" ? stripMark(node[field], key) : node[field];
  }
  return copy;
}

// What on-then-off must leave. A mark that covers every character is removed and added back, so the
// mark stays. Any other state ends with the mark removed everywhere, because a mixed range gets the
// mark once and the second toggle removes it. A value mark is always cleared with null.
// Adding the mark also removes the marks it excludes, and that removal stays after the second toggle.
function expectedAfterOnAndOff(block: Block, toggle: MarkToggle): unknown {
  let expected: unknown = block;
  for (const excluded of toggle.excludes) {
    expected = stripMark(expected, excluded);
  }

  const leaves = textLeaves(block);
  const uniformlyMarked =
    leaves.length > 0 && leaves.every((leaf) => leaf[toggle.key] !== undefined);
  if (toggle.kind === "mark" && uniformlyMarked) {
    return expected;
  }
  return stripMark(expected, toggle.key);
}

// part selects one of `parts` slices of the text blocks. Each block gets `perBlock` toggles from the rotation.
function marksFor(
  name: string,
  value: EditorValue,
  toggles: readonly MarkToggle[],
  include: (block: Block) => boolean,
  part: number,
  perBlock = 3,
  parts = 2,
): void {
  const candidates: number[] = [];
  value.forEach((block, index) => {
    const record = blockAt(value, index);
    if (
      typeof record.type === "string" &&
      TEXT_BLOCK_TYPES.includes(record.type) &&
      allTextOf(block).length > 0 &&
      include(record)
    ) {
      candidates.push(index);
    }
  });
  const from = Math.floor((candidates.length * part) / parts);
  const to = Math.floor((candidates.length * (part + 1)) / parts);

  for (const index of candidates.slice(from, to)) {
    const block = blockAt(value, index);
    const chosen = Array.from(
      { length: perBlock },
      (_, offset) => toggles[(index * perBlock + offset) % toggles.length],
    ).filter((toggle): toggle is MarkToggle => toggle !== undefined);
    const editor = freshEditor(value);
    const before = snapshot(editor);
    for (const toggle of chosen) {
      const label = `${blockLabel(name, index, block)} with ${toggle.key}`;
      const start = editor.api.start([index]);
      const end = editor.api.end([index]);
      if (start === undefined || end === undefined) {
        throw new Error(`${label}: the block has no start or end point.`);
      }
      editor.tf.select({ anchor: start, focus: end });

      const uniformlyMarked = textLeaves(block).every((leaf) => leaf[toggle.key] !== undefined);
      toggle.on(editor);
      checkInvariants(editor, `${label} on`);
      const turnedOn = snapshot(editor);
      if (allTextOf(turnedOn) !== allTextOf(before)) {
        throw new Error(`${label}: applying the mark changed the text.`);
      }
      // An uncovered range gets the mark. A fully covered mark command removes it first.
      const markedAfterOn = collect(blockAt(turnedOn, index)).marks[toggle.key] !== undefined;
      if (markedAfterOn === uniformlyMarked && toggle.kind === "mark") {
        throw new Error(`${label}: the first toggle did not change the mark.`);
      }

      toggle.off(editor);
      checkInvariants(editor, `${label} off`);
      if (allTextOf(snapshot(editor)) !== allTextOf(before)) {
        throw new Error(`${label}: removing the mark changed the text.`);
      }
      // Only this block may differ from its expected content. Every other block must be untouched.
      const finalDocument = snapshot(editor);
      expectSameContent(
        finalDocument[index],
        expectedAfterOnAndOff(before[index] as Block, toggle),
        `${label}: after on and off`,
        {
          ignoreIds: false,
        },
      );
      expectExact(
        withoutIndex(finalDocument, index),
        withoutIndex(before, index),
        `${label}: another block changed`,
      );
      undoBackTo(editor, before, label);
    }
  }
}

describe("turn into", () => {
  for (const name of ["demo", "worst"]) {
    for (const part of [0, 1]) {
      test(`${name} blocks turn into each offered target, keep their text and marks, and undo restores them (part ${part + 1} of 2)`, () => {
        const value = fixtureNamed(name);
        turnEach(
          name,
          value,
          Math.floor((value.length * part) / 2),
          Math.floor((value.length * (part + 1)) / 2),
        );
      });
    }
  }

  // A refused Turn into returns false and changes nothing.
  test("a refused Turn into reports false to the caller", () => {
    const value = fixtureNamed("worst");
    const editor = freshEditor(value);
    let target: { index: number; kind: BlockMenuKind } | undefined;
    for (let index = 0; index < value.length && target === undefined; index += 1) {
      const view = menuBlockView(editor, [index]);
      const refused = view
        ? (blockMenuDecisions(view) ?? []).find((item) => !item.allowed)
        : undefined;
      if (refused !== undefined) {
        target = { index, kind: refused.kind };
      }
    }
    if (target === undefined) {
      throw new Error("The worst fixture has no block that refuses a turn.");
    }

    const before = snapshot(editor);
    expect(
      runEditorCommand(editor, turnBlockInto, { path: [target.index], kind: target.kind }),
    ).toBe(false);
    expectExact(snapshot(editor), before, "a refused Turn into");
  });
});

function turnEach(name: string, value: EditorValue, from: number, to: number): void {
  for (let index = from; index < to; index += 1) {
    const label = blockLabel(name, index, value[index]);
    const view = menuBlockView(freshEditor(value), [index]);
    if (!view) {
      continue;
    }

    const originalKind = currentBlockMenuKind(view);
    const decisions = blockMenuDecisions(view) ?? [];
    const editor = freshEditor(value);
    const before = snapshot(editor);
    for (const decision of decisions) {
      if (!decision.allowed || decision.effect === "same") {
        continue;
      }

      const forwardLabel = `${label} turned into ${decision.kind}`;
      runEditorCommand(editor, turnBlockInto, { path: [index], kind: decision.kind });
      checkInvariants(editor, forwardLabel);
      const after = snapshot(editor);

      if (allTextOf(after) !== allTextOf(before)) {
        throw new Error(`${forwardLabel}: the text changed.`);
      }
      if (inlineSignature(after) !== inlineSignature(before)) {
        throw new Error(`${forwardLabel}: marks, inline elements or references changed.`);
      }
      if (decision.effect === "to-code") {
        expectCodeKeepsOnlyText(after, index, before, forwardLabel);
      }

      editor.tf.undo();
      expectExact(snapshot(editor), before, `${forwardLabel}: undo`);

      // A way back is checked only when the menu offers the original kind on the converted block.
      if (originalKind === null) {
        continue;
      }
      runEditorCommand(editor, turnBlockInto, { path: [index], kind: decision.kind });
      const converted = menuBlockView(editor, [index]);
      const back = converted
        ? (blockMenuDecisions(converted) ?? []).find((item) => item.kind === originalKind)
        : undefined;
      if (back === undefined || !back.allowed || back.effect === "same") {
        continue;
      }

      runEditorCommand(editor, turnBlockInto, { path: [index], kind: originalKind });
      checkInvariants(editor, `${forwardLabel} and back`);
      const returned = snapshot(editor);
      if (allTextOf(returned) !== allTextOf(before)) {
        throw new Error(`${forwardLabel} and back: the text changed.`);
      }
      if (inlineSignature(returned) !== inlineSignature(before)) {
        throw new Error(`${forwardLabel} and back: marks, inline elements or references changed.`);
      }
      undoBackTo(editor, before, forwardLabel);
    }
  }
}

// A code block keeps the text of its lines. The attributes of the source block are dropped by design.
function expectCodeKeepsOnlyText(
  after: EditorValue,
  index: number,
  before: EditorValue,
  label: string,
): void {
  const code = blockAt(after, index);
  if (code.type !== "code_block") {
    throw new Error(`${label}: the block is not a code block.`);
  }

  const allowedKeys = new Set(["type", "id", "children", "lang"]);
  for (const key of Object.keys(code)) {
    if (!allowedKeys.has(key)) {
      throw new Error(`${label}: the code block kept ${key}, which code does not store.`);
    }
  }

  if (allTextOf(code) !== allTextOf(blockAt(before, index))) {
    throw new Error(`${label}: the code block lost text.`);
  }
}

describe("read-only", () => {
  test("in read-only mode every command refuses and the document does not change", () => {
    for (const fixture of FIXTURES) {
      const editor = freshEditor(fixture.value);
      const before = snapshot(editor);
      editor.dom.readOnly = true;

      const kinds: BlockMenuKind[] = ["paragraph", "h1", "toggle", "code"];
      for (let index = 0; index < fixture.value.length; index += 1) {
        const label = blockLabel(fixture.name, index, fixture.value[index]);
        expect(runEditorCommand(editor, duplicateBlock, { path: [index] }), label).toBe(false);
        expect(runEditorCommand(editor, deleteBlock, { path: [index] }), label).toBe(false);
        expect(runEditorCommand(editor, moveBlock, { from: [index], to: [index] }), label).toBe(
          false,
        );
        for (const kind of kinds) {
          expect(runEditorCommand(editor, turnBlockInto, { path: [index], kind }), label).toBe(
            false,
          );
        }
      }

      editor.dom.readOnly = false;
      expectExact(
        snapshot(editor),
        before,
        `${fixture.name}: read-only commands changed the document`,
      );
    }
  });
});

describe("undo of a merge", () => {
  // DEFECT: undoing a backspace that merged two paragraphs restores the second one with a new id, so an
  // id-based reference (a synced reference, for example) can no longer find its block. Suspected in Plate's
  // history and split path, which the editor does not override (unsure of the exact source).
  test.failing("undo after backspace at the start of a paragraph restores the block id", () => {
    const editor = createEditor([
      { type: "p", id: "merge-a", children: [{ text: "one" }] },
      { type: "p", id: "merge-b", children: [{ text: "two" }] },
    ] as unknown as EditorValue);
    const before = snapshot(editor);
    const start = editor.api.start([1]);
    if (start === undefined) {
      throw new Error("The second paragraph has no start point.");
    }
    editor.tf.select(start);
    editor.tf.deleteBackward("character");
    editor.tf.undo();
    expectExact(snapshot(editor), before, "undo after merge");
  });
});

describe("global invariants", () => {
  test("each fixture satisfies the invariants before any operation", () => {
    for (const fixture of FIXTURES) {
      checkInvariants(freshEditor(fixture.value), `${fixture.name} fixture`);
    }
  });
});
