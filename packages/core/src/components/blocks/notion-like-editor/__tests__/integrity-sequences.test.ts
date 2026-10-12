import { describe, expect, test } from "bun:test";
import type { SlateEditor } from "platejs";

import { DEMO_DOCUMENT_VALUE } from "../demo/demo-document";
import { blockMenuDecisions, menuBlockView } from "../lib/features/editor-block-menu";
import {
  duplicateBlock,
  deleteBlock,
  formatBold,
  formatCode,
  formatItalic,
  formatKeyboard,
  formatStrikethrough,
  formatSubscript,
  formatSuperscript,
  formatUnderline,
  HISTORY_COMMANDS,
  moveBlock,
  runEditorCommand,
  turnBlockInto,
  type EditorCommand,
} from "../lib/commands/editor-commands";
import { indentBlocks, outdentBlocks } from "../lib/features/editor-block-indent";
import { siblingMove } from "../lib/features/editor-block-drop";
import { insertFootnote } from "../lib/features/editor-footnote";
import { replaceAllFindMatches } from "../lib/features/editor-find-replace";
import { setFindQuery } from "../lib/plugins/editor-find";
import { setBlockTone } from "../lib/features/editor-block-tone";
import { PALETTE_TOKENS } from "../lib/document/editor-document-schema";
import type { EditorValue } from "../lib/document/editor-value";
import {
  allTextOf,
  checkInvariants,
  cloneValue,
  isRecordValue,
  mulberry32,
  pick,
  randomInt,
  snapshot,
  stableJson,
  type Rng,
} from "./integrity-helpers";
import { createEditor } from "./test-utils";

const SEQUENCES = 60;
const STEPS = 15;

const TEXT_BLOCK_TYPES: readonly string[] = ["p", "h1", "h2", "h3"];
const INLINE_VOID_TYPES: readonly string[] = ["mention", "date", "inline_equation", "footnote_ref"];
const MARK_COMMANDS: readonly { name: string; command: EditorCommand }[] = [
  { name: "bold", command: formatBold },
  { name: "italic", command: formatItalic },
  { name: "underline", command: formatUnderline },
  { name: "strikethrough", command: formatStrikethrough },
  { name: "code", command: formatCode },
  { name: "superscript", command: formatSuperscript },
  { name: "subscript", command: formatSubscript },
  { name: "kbd", command: formatKeyboard },
];
const QUERY_LETTERS = "abcdefghilmnoprstu";
const SHORT_REPLACEMENTS = ["zz", "Q", "ok ", "é", "x y"] as const;
const OPERATIONS = [
  "type",
  "delete backward",
  "insert break",
  "mark",
  "turn into",
  "indent or outdent",
  "tone",
  "duplicate",
  "move",
  "delete block",
  "footnote",
  "replace all",
  "undo",
  "redo",
] as const;

type Operation = (typeof OPERATIONS)[number];

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

// A random top-level text block, or undefined when the document has none.
function randomTextBlock(editor: SlateEditor, rng: Rng): number | undefined {
  const candidates: number[] = [];
  editor.children.forEach((block, index) => {
    if (
      isRecordValue(block) &&
      typeof block.type === "string" &&
      TEXT_BLOCK_TYPES.includes(block.type)
    ) {
      candidates.push(index);
    }
  });
  return candidates.length === 0 ? undefined : pick(rng, candidates);
}

function randomBlock(editor: SlateEditor, rng: Rng): number {
  return randomInt(rng, editor.children.length);
}

// Puts the caret at the start or end of a block. Both are real points, so the caret is always valid.
function caretInBlock(editor: SlateEditor, index: number, rng: Rng): boolean {
  const point = rng() < 0.5 ? editor.api.start([index]) : editor.api.end([index]);
  if (point === undefined) {
    return false;
  }
  editor.tf.select(point);
  return true;
}

// A range from the start of a block into its first text leaf, at a random offset.
function rangeInBlock(editor: SlateEditor, index: number, rng: Rng): boolean {
  const start = editor.api.start([index]);
  if (start === undefined) {
    return false;
  }
  const entry = editor.api.node(start.path);
  const leaf = entry?.[0];
  if (leaf === undefined || !isRecordValue(leaf) || typeof leaf.text !== "string") {
    return false;
  }
  const focus = { path: start.path, offset: randomInt(rng, leaf.text.length + 1) };
  editor.tf.select({ anchor: start, focus });
  return true;
}

// One step. Returns a short description for the failure message, or undefined when nothing could run.
function runStep(editor: SlateEditor, rng: Rng, operation: Operation): string | undefined {
  if (operation === "undo" || operation === "redo") {
    const command = HISTORY_COMMANDS[operation === "undo" ? 0 : 1];
    if (command === undefined) {
      return undefined;
    }
    runEditorCommand(editor, command, undefined);
    return operation;
  }

  if (operation === "type") {
    const index = randomTextBlock(editor, rng);
    if (index === undefined || !caretInBlock(editor, index, rng)) {
      return undefined;
    }
    const letter = pick(rng, [...QUERY_LETTERS]);
    editor.tf.insertText(letter);
    return `type "${letter}" in block ${index}`;
  }

  if (operation === "delete backward") {
    // The caret goes to the end of a block with text. Backspace at a block start merges two blocks, and
    // undoing a merge gives the restored block a new id (a known defect, see integrity-operations).
    const index = randomTextBlock(editor, rng);
    if (index === undefined || allTextOf(editor.children[index]).length === 0) {
      return undefined;
    }
    const end = editor.api.end([index]);
    if (end === undefined) {
      return undefined;
    }
    editor.tf.select(end);
    editor.tf.deleteBackward("character");
    return `delete backward in block ${index}`;
  }

  if (operation === "insert break") {
    const index = randomTextBlock(editor, rng);
    if (index === undefined || !caretInBlock(editor, index, rng)) {
      return undefined;
    }
    editor.tf.insertBreak();
    return `insert break in block ${index}`;
  }

  if (operation === "mark") {
    // Marks on a range that holds an inline element are a known defect (see integrity-operations).
    // Such blocks are skipped here, so one defect does not end every sequence at the same point.
    const index = randomTextBlock(editor, rng);
    if (index === undefined) {
      return undefined;
    }
    const block = editor.children[index];
    if (containsType(block, INLINE_VOID_TYPES) || !rangeInBlock(editor, index, rng)) {
      return undefined;
    }
    const mark = pick(rng, MARK_COMMANDS);
    runEditorCommand(editor, mark.command, undefined);
    return `toggle ${mark.name} on a range in block ${index}`;
  }

  if (operation === "turn into") {
    const index = randomBlock(editor, rng);
    const view = menuBlockView(editor, [index]);
    const offered = (view ? (blockMenuDecisions(view) ?? []) : []).filter(
      (item) => item.allowed && item.effect !== "same",
    );
    const choice = offered.length === 0 ? undefined : pick(rng, offered);
    if (choice === undefined) {
      return undefined;
    }
    runEditorCommand(editor, turnBlockInto, { path: [index], kind: choice.kind });
    return `turn block ${index} into ${choice.kind}`;
  }

  if (operation === "indent or outdent") {
    const index = randomBlock(editor, rng);
    if (!caretInBlock(editor, index, rng)) {
      return undefined;
    }
    const command = rng() < 0.5 ? indentBlocks : outdentBlocks;
    runEditorCommand(editor, command, undefined);
    return `${command.id} at block ${index}`;
  }

  if (operation === "tone") {
    const index = randomBlock(editor, rng);
    const id = editor.children[index];
    if (!isRecordValue(id) || typeof id.id !== "string") {
      return undefined;
    }
    const token = rng() < 0.2 ? null : pick(rng, PALETTE_TOKENS);
    const kind = rng() < 0.5 ? "text" : "background";
    runEditorCommand(editor, setBlockTone, { ids: [id.id], kind, token });
    return `tone ${kind} ${String(token)} on block ${index}`;
  }

  if (operation === "duplicate") {
    const index = randomBlock(editor, rng);
    runEditorCommand(editor, duplicateBlock, { path: [index] });
    return `duplicate block ${index}`;
  }

  if (operation === "move") {
    const index = randomBlock(editor, rng);
    const direction = rng() < 0.5 ? "up" : "down";
    const step = siblingMove(editor.children, [index], direction);
    if (!step.ok) {
      return undefined;
    }
    runEditorCommand(editor, moveBlock, { from: [index], to: step.to });
    return `move block ${index} ${direction}`;
  }

  if (operation === "delete block") {
    const index = randomBlock(editor, rng);
    runEditorCommand(editor, deleteBlock, { path: [index] });
    return `delete block ${index}`;
  }

  if (operation === "footnote") {
    const index = randomTextBlock(editor, rng);
    if (index === undefined || !caretInBlock(editor, index, rng)) {
      return undefined;
    }
    runEditorCommand(editor, insertFootnote, undefined);
    return `insert footnote in block ${index}`;
  }

  // replace all
  const query = `${pick(rng, [...QUERY_LETTERS])}${pick(rng, [...QUERY_LETTERS])}`;
  const replacement = pick(rng, SHORT_REPLACEMENTS);
  setFindQuery(editor, query);
  runEditorCommand(editor, replaceAllFindMatches, { replacement });
  return `replace all "${query}" with "${replacement}"`;
}

// Undo until nothing is left, then compare with the document before the first step.
function undoAll(editor: SlateEditor): void {
  let guard = 0;
  while (editor.history.undos.length > 0 && guard < 5_000) {
    editor.tf.undo();
    guard += 1;
  }
}

function runSequence(seed: number): void {
  const rng = mulberry32(seed);
  const editor = createEditor(cloneValue(DEMO_DOCUMENT_VALUE) as EditorValue);
  const initial = snapshot(editor);
  const log: string[] = [];

  for (let step = 0; step < STEPS; step += 1) {
    const operation = pick(rng, OPERATIONS);
    let description: string | undefined;
    try {
      description = runStep(editor, rng, operation);
    } catch (error) {
      throw new Error(
        `seed ${seed}, step ${step}, ${operation}: a command threw ${String(error).slice(0, 200)}. Steps so far: ${log.join(" ; ")}`,
      );
    }

    if (description !== undefined) {
      log.push(`${step}: ${description}`);
    }

    try {
      checkInvariants(editor, description ?? operation);
    } catch (error) {
      throw new Error(
        `seed ${seed}, step ${step}, ${description ?? operation}: first violated invariant: ${String(error).slice(0, 240)}. Steps so far: ${log.join(" ; ")}`,
      );
    }
  }

  undoAll(editor);
  if (stableJson(snapshot(editor)) !== stableJson(initial)) {
    throw new Error(
      `seed ${seed}: after undoing every step the document is not the starting document. Steps: ${log.join(" ; ")}`,
    );
  }
}

describe("random command sequences", () => {
  // Each block of sequences is its own test, so each test stays well inside the 5 second limit.
  for (const part of [0, 1, 2]) {
    test(`sequences ${part * (SEQUENCES / 3) + 1} to ${(part + 1) * (SEQUENCES / 3)}: ${STEPS} random real commands each, invariants after every step, undo back to the start`, () => {
      for (
        let sequence = part * (SEQUENCES / 3);
        sequence < (part + 1) * (SEQUENCES / 3);
        sequence += 1
      ) {
        runSequence(7000 + sequence);
      }
    });
  }

  test("the operation list draws every kind of command", () => {
    const rng = mulberry32(7000);
    const seen = new Set<string>();
    for (let index = 0; index < 500; index += 1) {
      seen.add(pick(rng, OPERATIONS));
    }
    expect([...seen].sort()).toEqual([...OPERATIONS].sort());
  });
});
