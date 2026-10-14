import { KEYS } from "platejs";

import { formatBlockLabel } from "../document/editor-document";
import type { Repair } from "../document/editor-document-ids";
import { FOOTNOTE_DEF_KEY, FOOTNOTE_REF_KEY } from "../document/editor-document-schema";
import type { EditorValue } from "../document/editor-value";
import { createFootnoteId, isFootnoteId } from "./editor-footnote-id";

const FOOTNOTE_NESTED_MESSAGE =
  "A footnote definition outside the top level was turned into a paragraph.";
const FOOTNOTE_INVALID_ID_MESSAGE =
  "A footnote definition had an invalid footnote id. It was turned into a paragraph.";
const FOOTNOTE_DUPLICATE_MESSAGE =
  "A footnote definition reused a footnote id. A new id was assigned so each definition stays unique.";
const FOOTNOTE_REFERENCE_REMOVED_MESSAGE =
  "A footnote reference inside a footnote definition was removed.";

type FootnoteRepairResult = {
  content: EditorValue;
  repairs: Repair[];
};

type FootnoteElement = Record<string, unknown> & { type: string; children: unknown[] };

type RepairContext = {
  seen: Set<string>;
  repairs: Repair[];
};

function isElementRecord(value: unknown): value is FootnoteElement {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    "type" in value &&
    typeof value.type === "string" &&
    "children" in value &&
    Array.isArray(value.children)
  );
}

// A reference cannot sit inside a definition. Every removed reference is reported.
function stripReferences(
  children: readonly unknown[],
  path: number[],
  repairs: Repair[],
): { children: unknown[]; changed: boolean } {
  let changed = false;
  const next: unknown[] = [];
  for (const child of children) {
    if (isElementRecord(child) && child.type === FOOTNOTE_REF_KEY) {
      repairs.push({
        path,
        message: `${formatBlockLabel(path)} ${FOOTNOTE_REFERENCE_REMOVED_MESSAGE}`,
      });
      changed = true;
      continue;
    }

    if (isElementRecord(child)) {
      const inner = stripReferences(child.children, path, repairs);
      if (inner.changed) {
        changed = true;
        next.push({ ...child, children: inner.children });
        continue;
      }
    }

    next.push(child);
  }

  return { children: changed ? next : [...children], changed };
}

function freshFootnoteId(seen: Set<string>): string {
  let id = createFootnoteId();
  while (seen.has(id)) {
    id = createFootnoteId();
  }

  return id;
}

function definitionAsParagraph(node: FootnoteElement, children: unknown[]): FootnoteElement {
  const paragraph: FootnoteElement = { ...node, type: KEYS.p, children };
  Reflect.deleteProperty(paragraph, "footnoteId");
  return paragraph;
}

// The first definition of an id keeps it. A later one gets a fresh id and stays unreferenced.
function repairDefinition(node: FootnoteElement, path: number[], context: RepairContext): unknown {
  const stripped = stripReferences(node.children, path, context.repairs);
  const nested = path.length > 1;
  if (nested || !isFootnoteId(node.footnoteId)) {
    context.repairs.push({
      path,
      message: `${formatBlockLabel(path)} ${nested ? FOOTNOTE_NESTED_MESSAGE : FOOTNOTE_INVALID_ID_MESSAGE}`,
    });
    return definitionAsParagraph(node, stripped.children);
  }

  let footnoteId = node.footnoteId;
  let changed = stripped.changed;
  if (context.seen.has(footnoteId)) {
    footnoteId = freshFootnoteId(context.seen);
    context.repairs.push({
      path,
      message: `${formatBlockLabel(path)} ${FOOTNOTE_DUPLICATE_MESSAGE}`,
    });
    changed = true;
  }

  context.seen.add(footnoteId);
  if (!changed) {
    return node;
  }

  return { ...node, footnoteId, children: stripped.children };
}

function repairNode(value: unknown, path: number[], context: RepairContext): unknown {
  if (!isElementRecord(value)) {
    return value;
  }

  if (value.type === FOOTNOTE_DEF_KEY) {
    return repairDefinition(value, path, context);
  }

  let changed = false;
  const children = value.children.map((child, index) => {
    const next = repairNode(child, [...path, index], context);
    if (next !== child) {
      changed = true;
    }

    return next;
  });
  return changed ? { ...value, children } : value;
}

// Runs before the column and attribute repairs, so a definition moved out of a column is a paragraph.
// `reserved` holds ids already in the document. A pasted definition with one of them gets a fresh id.
export function repairFootnoteContent(
  content: EditorValue,
  reserved: ReadonlySet<string> = new Set<string>(),
): FootnoteRepairResult {
  const context: RepairContext = { seen: new Set(reserved), repairs: [] };
  let changed = false;
  const next = content.map((node, index) => {
    const repaired = repairNode(node, [index], context);
    if (repaired !== node) {
      changed = true;
    }

    return repaired;
  });

  if (!changed) {
    return { content, repairs: context.repairs };
  }

  return { content: next as EditorValue, repairs: context.repairs };
}
