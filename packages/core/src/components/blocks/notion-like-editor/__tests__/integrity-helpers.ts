import type { SlateEditor } from "platejs";

import { createEditorDocument } from "../lib/document/editor-document";
import { parseEditorDocument, type ParseResult } from "../lib/document/editor-document-validate";
import type { EditorValue } from "../lib/document/editor-value";

// Deterministic helpers for the integrity suite. No Math.random and no clock: every
// random choice comes from a seeded generator, so a failing message can be replayed.

export type Rng = () => number;

// mulberry32: a small 32-bit generator. The same seed always gives the same sequence.
export function mulberry32(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomInt(rng: Rng, max: number): number {
  if (max <= 0) {
    throw new Error(`randomInt needs a positive bound, got ${max}.`);
  }

  return Math.floor(rng() * max);
}

export function pick<T>(rng: Rng, items: readonly T[]): T {
  const item = items[randomInt(rng, items.length)];
  if (item === undefined) {
    throw new Error("pick needs a non-empty list.");
  }

  return item;
}

export function chance(rng: Rng, probability: number): boolean {
  return rng() < probability;
}

// Deep JSON clone. Plate's nodes are plain data, so this is the snapshot every test compares.
export function cloneValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function snapshot(editor: SlateEditor): EditorValue {
  return cloneValue(editor.children) as EditorValue;
}

export function isRecordValue(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isTextLeaf(value: unknown): value is Record<string, unknown> & { text: string } {
  return isRecordValue(value) && typeof value.text === "string" && !("children" in value);
}

export function parseValue(content: unknown): ParseResult {
  return parseEditorDocument(createEditorDocument("integrity", content as EditorValue));
}

export function describeIssues(result: ParseResult): string {
  if (result.status === "ok") {
    return result.repairs.map((repair) => repair.message).join(" | ");
  }

  if (result.status === "future-version") {
    return `schemaVersion ${result.schemaVersion}`;
  }

  return result.issues.map((issue) => `${JSON.stringify(issue.path)} ${issue.message}`).join(" | ");
}

// The document the editor would save must parse as ok with nothing to repair.
export function expectValid(editor: SlateEditor, label: string): void {
  checkValid(snapshot(editor), label);
}

export function checkValid(content: unknown, label: string): void {
  const result = parseValue(content);
  if (result.status !== "ok") {
    throw new Error(`${label}: document is ${result.status}: ${describeIssues(result)}`);
  }

  if (result.repairs.length > 0) {
    throw new Error(
      `${label}: document needed ${result.repairs.length} repair(s): ${describeIssues(result)}`,
    );
  }
}

export type EqualOptions = {
  /** Drop every `id` key before comparing. */
  ignoreIds: boolean;
  /** Extra keys to drop before comparing, such as footnoteId for a documented remap. */
  ignoreKeys?: readonly string[];
};

// Adjacent text leaves with the same marks are one run. Empty leaves go when a sibling exists.
function mergeTextRuns(children: unknown[]): unknown[] {
  const merged: unknown[] = [];
  for (const child of children) {
    const previous = merged[merged.length - 1];
    if (isTextLeaf(child) && isTextLeaf(previous) && sameMarks(previous, child)) {
      merged[merged.length - 1] = { ...previous, text: previous.text + child.text };
      continue;
    }
    merged.push(child);
  }

  if (merged.length <= 1) {
    return merged;
  }

  return merged.filter((child) => !(isTextLeaf(child) && child.text === ""));
}

function marksOf(leaf: Record<string, unknown>): string {
  const marks: Record<string, unknown> = {};
  for (const key of Object.keys(leaf)) {
    if (key !== "text") {
      marks[key] = leaf[key];
    }
  }
  return JSON.stringify(sortKeys(marks));
}

function sameMarks(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  return marksOf(a) === marksOf(b);
}

function sortKeys(value: Record<string, unknown>): Record<string, unknown> {
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    sorted[key] = value[key];
  }
  return sorted;
}

// A canonical copy: sorted keys, optional id removal, and merged text runs.
export function canonicalize(value: unknown, options: EqualOptions): unknown {
  if (Array.isArray(value)) {
    return mergeTextRuns(value.map((child) => canonicalize(child, options)));
  }

  if (!isRecordValue(value)) {
    return value;
  }

  const copy: Record<string, unknown> = {};
  for (const key of Object.keys(value)) {
    if (options.ignoreIds && key === "id") {
      continue;
    }
    if (options.ignoreKeys?.includes(key)) {
      continue;
    }
    copy[key] = value[key];
  }

  if (Array.isArray(copy.children)) {
    copy.children = canonicalize(copy.children, options);
  }

  return sortKeys(copy);
}

// Equal as content. Only ids are dropped when ignoreIds is set. Text runs with the same marks are merged.
export function semanticEqual(a: unknown, b: unknown, options: EqualOptions): boolean {
  return (
    JSON.stringify(canonicalize(cloneValue(a), options)) ===
    JSON.stringify(canonicalize(cloneValue(b), options))
  );
}

// JSON with keys sorted at every level. Undo may restore the same content in another key order.
export function stableJson(value: unknown): string {
  return JSON.stringify(sortDeep(value));
}

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((child) => sortDeep(child));
  }

  if (!isRecordValue(value)) {
    return value;
  }

  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    sorted[key] = sortDeep(value[key]);
  }
  return sorted;
}

// The first place two stable JSON strings differ, for failure messages.
export function describeDifference(expected: unknown, actual: unknown): string {
  const left = stableJson(expected);
  const right = stableJson(actual);
  let index = 0;
  while (index < left.length && index < right.length && left[index] === right[index]) {
    index += 1;
  }

  const from = Math.max(0, index - 80);
  return `at ${index}: expected ...${left.slice(from, index + 120)} but got ...${right.slice(from, index + 120)}`;
}

// The first place two canonical values differ, for failure messages.
export function firstDifference(a: unknown, b: unknown, options: EqualOptions): string {
  const left = JSON.stringify(canonicalize(cloneValue(a), options));
  const right = JSON.stringify(canonicalize(cloneValue(b), options));
  let index = 0;
  while (index < left.length && index < right.length && left[index] === right[index]) {
    index += 1;
  }

  const from = Math.max(0, index - 80);
  return `at ${index}: expected ...${left.slice(from, index + 120)} but got ...${right.slice(from, index + 120)}`;
}

// Concatenated text of every leaf, in document order.
export function allTextOf(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map((child) => allTextOf(child)).join("");
  }

  if (!isRecordValue(value)) {
    return "";
  }

  if (typeof value.text === "string") {
    return value.text;
  }

  return allTextOf(value.children);
}

// The text of each top-level block, in order. Used to check that an operation moved or copied text.
export function topLevelTexts(value: unknown): string[] {
  return Array.isArray(value) ? value.map((block) => allTextOf(block)) : [];
}

export type Reference = {
  key: string;
  value: unknown;
  type: string;
};

const REFERENCE_KEYS = [
  "url",
  "pageId",
  "entityId",
  "footnoteId",
  "targetBlockId",
  "date",
  "texExpression",
] as const;

export type Collected = {
  types: Record<string, number>;
  marks: Record<string, number>;
  references: Reference[];
};

// Counts every element type and every mark key, and lists each asset-like reference in order.
export function collect(value: unknown): Collected {
  const collected: Collected = { types: {}, marks: {}, references: [] };
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const child of node) {
        visit(child);
      }
      return;
    }

    if (!isRecordValue(node)) {
      return;
    }

    if (typeof node.text === "string" && !("children" in node)) {
      for (const key of Object.keys(node)) {
        if (key !== "text") {
          collected.marks[key] = (collected.marks[key] ?? 0) + 1;
        }
      }
      return;
    }

    const type = typeof node.type === "string" ? node.type : "";
    collected.types[type] = (collected.types[type] ?? 0) + 1;
    for (const key of REFERENCE_KEYS) {
      if (key in node) {
        collected.references.push({ key, value: node[key], type });
      }
    }

    visit(node.children);
  };

  visit(value);
  return collected;
}

// Every element id in the document, in order. Inline elements are included.
export function allElementIds(value: unknown): string[] {
  const ids: string[] = [];
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const child of node) {
        visit(child);
      }
      return;
    }

    if (!isRecordValue(node) || (typeof node.text === "string" && !("children" in node))) {
      return;
    }

    if (typeof node.id === "string") {
      ids.push(node.id);
    }
    visit(node.children);
  };

  visit(value);
  return ids;
}

// Index of the top-level block that holds a node with this id, or undefined.
export function topLevelIndexOf(value: unknown, id: string): number | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  for (let index = 0; index < value.length; index += 1) {
    if (allElementIds(value[index]).includes(id)) {
      return index;
    }
  }

  return undefined;
}

// Invariants that must hold after every single operation, not only at the end.
export function checkInvariants(editor: SlateEditor, label: string): void {
  const content = snapshot(editor);
  checkValid(content, label);

  const ids = allElementIds(content);
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) {
      throw new Error(`${label}: element id "${id}" appears more than once.`);
    }
    seen.add(id);
  }

  const checkNode = (node: unknown, inDefinition: boolean): void => {
    if (Array.isArray(node)) {
      for (const child of node) {
        checkNode(child, inDefinition);
      }
      return;
    }

    if (!isRecordValue(node) || isTextLeaf(node)) {
      return;
    }

    if (node.type === "a" && allTextOf(node) === "") {
      throw new Error(
        `${label}: an empty link element is in the document (id ${String(node.id)}).`,
      );
    }

    if (node.type === "footnote_ref" && inDefinition) {
      throw new Error(`${label}: a footnote reference sits inside a footnote definition.`);
    }

    const nested = inDefinition || node.type === "footnote_def";
    checkNode(node.children, nested);
  };

  checkNode(content, false);
}
