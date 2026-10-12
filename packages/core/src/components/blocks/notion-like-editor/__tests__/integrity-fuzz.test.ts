import { describe, expect, test } from "bun:test";

import { DEMO_DOCUMENT_VALUE } from "../demo/demo-document";
import { createEditorDocument } from "../lib/document/editor-document";
import {
  allowedChildTypes,
  allowedElementAttrs,
  isAllowedElementAttrValue,
  isAllowedMark,
} from "../lib/document/editor-document-schema";
import { parseEditorDocument, type ParseResult } from "../lib/document/editor-document-validate";
import type { EditorValue } from "../lib/document/editor-value";
import {
  allTextOf,
  checkValid,
  chance,
  cloneValue,
  describeIssues,
  isRecordValue,
  isTextLeaf,
  mulberry32,
  pick,
  randomInt,
  snapshot,
  type Rng,
} from "./integrity-helpers";
import { WORST_CASE_VALUE } from "./integrity-fixtures";
import { createEditor } from "./test-utils";

type Node = Record<string, unknown>;

// Every mutation is one of these kinds. The expectation says what the schema requires of the result.
type Expectation = "rejected-or-repaired" | "any";

type Mutation = {
  kind: string;
  expectation: Expectation;
  description: string;
  content: unknown[];
  schemaVersion: unknown;
  hasSchemaVersion: boolean;
};

const WRONG_VALUES: readonly unknown[] = [
  42,
  null,
  { nested: true },
  [1, 2],
  "x".repeat(10_000),
  "a\u0007b\u0000c\u001fd",
];

const URL_KEYS = ["url", "src", "imageUrl"] as const;

const FORBIDDEN_INSERTS = ["footnote_def", "table", "column_group", "footnote_ref"] as const;

// Control characters other than tab and newline. Built from char codes, so no control character sits in a regex.
function hasControlChar(text: string): boolean {
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if ((code <= 0x1f && code !== 0x09 && code !== 0x0a) || code === 0x7f) {
      return true;
    }
  }
  return false;
}

function fresh(rng: Rng, prefix: string): string {
  return `${prefix}-${randomInt(rng, 1_000_000).toString(36)}`;
}

function isElement(value: unknown): value is Node & { type: string; children: unknown[] } {
  return isRecordValue(value) && typeof value.type === "string" && Array.isArray(value.children);
}

function elementsOf(content: unknown, out: Node[] = []): Node[] {
  if (Array.isArray(content)) {
    content.forEach((child) => elementsOf(child, out));
  } else if (isElement(content)) {
    out.push(content);
    elementsOf(content.children, out);
  }
  return out;
}

function leavesOf(content: unknown, out: Node[] = []): Node[] {
  if (Array.isArray(content)) {
    content.forEach((child) => leavesOf(child, out));
  } else if (isTextLeaf(content)) {
    out.push(content);
  } else if (isRecordValue(content) && Array.isArray(content.children)) {
    leavesOf(content.children, out);
  }
  return out;
}

function pickOf<T>(rng: Rng, items: readonly T[]): T {
  return pick(rng, items);
}

// Structural attributes that every element needs; mutating them is covered by other kinds.
const RESERVED = new Set(["type", "children", "id"]);

function keysOf(node: Node): string[] {
  return Object.keys(node).filter((key) => !RESERVED.has(key) && key !== "text");
}

function mutateAttribute(
  rng: Rng,
  content: unknown[],
): Omit<Mutation, "content" | "schemaVersion" | "hasSchemaVersion"> & { content: unknown[] } {
  const elements = elementsOf(content);
  const leaves = leavesOf(content);
  const pickElement = elements.length > 0 && (leaves.length === 0 || chance(rng, 0.7));
  const choice = randomInt(rng, 6);

  if (pickElement) {
    // Attribute mutations need a node with an attribute to change. Most elements have none.
    const keyed = elements.filter((item) => keysOf(item).length > 0);
    const node =
      (choice <= 1 || choice === 5) && keyed.length > 0
        ? pickOf(rng, keyed)
        : pickOf(rng, elements);
    const keys = keysOf(node);
    if (choice === 0 && keys.length > 0) {
      const key = pickOf(rng, keys);
      delete node[key];
      return {
        kind: "delete attribute",
        expectation: "any",
        description: `${String(node.type)} without ${key}`,
        content,
      };
    }
    if (choice === 1 && keys.length > 0) {
      const key = pickOf(rng, keys);
      const value = pickOf(rng, WRONG_VALUES);
      node[key] = value;
      return {
        kind: "wrong attribute type",
        expectation: "rejected-or-repaired",
        description: `${String(node.type)}.${key} = ${JSON.stringify(value)?.slice(0, 40)}`,
        content,
      };
    }
    if (choice === 2) {
      const key = pickOf(rng, URL_KEYS);
      node[key] = "javascript:alert(1)";
      return {
        kind: "javascript url",
        expectation: "any",
        description: `${String(node.type)}.${key} = javascript:`,
        content,
      };
    }
    if (choice === 3) {
      node.type = `zz-unknown-${randomInt(rng, 1000)}`;
      return {
        kind: "unknown block type",
        expectation: "rejected-or-repaired",
        description: `type = ${String(node.type)}`,
        content,
      };
    }
    if (choice === 4) {
      node.zzUnknownAttr = pickOf(rng, [1, "x", true]);
      return {
        kind: "unknown attribute",
        expectation: "rejected-or-repaired",
        description: `${String(node.type)} gained zzUnknownAttr`,
        content,
      };
    }
    const type = String(node.type);
    if (keys.length > 0) {
      const key = pickOf(rng, keys);
      const value = pickOf(rng, ["c\u0001ontrol\u0007", "x".repeat(10_000)] as const);
      node[key] = value;
      return {
        kind: "control or long string",
        expectation: "any",
        description: `${type}.${key} = control or long string`,
        content,
      };
    }
    node.zzUnknownAttr = "x";
    return {
      kind: "unknown attribute",
      expectation: "rejected-or-repaired",
      description: `${type} gained zzUnknownAttr`,
      content,
    };
  }

  const leaf = pickOf(rng, leaves);
  if (choice === 5) {
    leaf.text = 5;
    return {
      kind: "text is not a string",
      expectation: "rejected-or-repaired",
      description: "text leaf text = 5",
      content,
    };
  }
  leaf.zzUnknownMark = true;
  return {
    kind: "unknown mark",
    expectation: "rejected-or-repaired",
    description: "text leaf gained zzUnknownMark",
    content,
  };
}

// Structural mutations: children, nesting, forbidden blocks and duplicate ids.
function mutateStructure(
  rng: Rng,
  content: unknown[],
): Omit<Mutation, "content" | "schemaVersion" | "hasSchemaVersion"> & { content: unknown[] } {
  const elements = elementsOf(content);
  const choice = randomInt(rng, 6);
  const node = pickOf(rng, elements);

  if (choice === 0) {
    delete node.children;
    return {
      kind: "children removed",
      expectation: "rejected-or-repaired",
      description: `${String(node.type)} has no children`,
      content,
    };
  }
  if (choice === 1) {
    node.children = [];
    return {
      kind: "children empty",
      expectation: "rejected-or-repaired",
      description: `${String(node.type)}.children = []`,
      content,
    };
  }
  if (choice === 2) {
    node.children = pickOf(rng, ["text", 5, {}] as const);
    return {
      kind: "children not an array",
      expectation: "rejected-or-repaired",
      description: `${String(node.type)}.children is not an array`,
      content,
    };
  }
  if (choice === 3) {
    const toggles = elements.filter((item) => item.type === "toggle");
    if (toggles.length === 0) {
      return mutateStructure(rng, content);
    }
    const target = pickOf(rng, toggles);
    let inner: Node = {
      type: "toggle",
      id: fresh(rng, "deep"),
      children: [{ type: "p", id: fresh(rng, "deep-p"), children: [{ text: "deep" }] }],
    };
    for (let depth = 0; depth < 4; depth += 1) {
      inner = {
        type: "toggle",
        id: fresh(rng, "deep"),
        children: [{ type: "p", id: fresh(rng, "deep-p"), children: [{ text: "level" }] }, inner],
      };
    }
    target.children = [...(target.children as unknown[]), inner];
    return {
      kind: "toggles nested past the limit",
      expectation: "rejected-or-repaired",
      description: `chain of toggles under ${String(target.id)}`,
      content,
    };
  }
  if (choice === 4) {
    const duplicateTarget = pickOf(
      rng,
      elements.filter((item) => typeof item.id === "string"),
    );
    const other = pickOf(
      rng,
      elements.filter((item) => typeof item.id === "string" && item !== duplicateTarget),
    );
    other.id = duplicateTarget.id;
    return {
      kind: "duplicate id",
      expectation: "rejected-or-repaired",
      description: `two nodes share id ${String(other.id)}`,
      content,
    };
  }

  // A forbidden block inside a parent that does not allow it.
  const kind = pickOf(rng, FORBIDDEN_INSERTS);
  // A reference is inline, so it is legal in a paragraph. Only a definition and a link refuse it.
  const parents = elements.filter((item) => {
    if (kind === "footnote_ref") {
      return item.type === "footnote_def" || item.type === "a";
    }
    const allowed = allowedChildTypes(String(item.type));
    return allowed === undefined || !allowed.includes(kind);
  });
  if (parents.length === 0) {
    return mutateStructure(rng, content);
  }
  const parent = pickOf(rng, parents);
  const child: Node =
    kind === "footnote_ref"
      ? {
          type: "footnote_ref",
          id: fresh(rng, "ref"),
          footnoteId: "fz-missing",
          children: [{ text: "" }],
        }
      : kind === "footnote_def"
        ? {
            type: "footnote_def",
            id: fresh(rng, "def"),
            footnoteId: "fz-def",
            children: [{ text: "definition" }],
          }
        : kind === "table"
          ? {
              type: "table",
              id: fresh(rng, "tbl"),
              children: [
                {
                  type: "tr",
                  id: fresh(rng, "row"),
                  children: [
                    {
                      type: "td",
                      id: fresh(rng, "cell"),
                      children: [
                        { type: "p", id: fresh(rng, "cell-p"), children: [{ text: "cell" }] },
                      ],
                    },
                  ],
                },
              ],
            }
          : {
              type: "column_group",
              id: fresh(rng, "cols"),
              children: [
                {
                  type: "column",
                  id: fresh(rng, "col"),
                  width: "100%",
                  children: [{ type: "p", id: fresh(rng, "col-p"), children: [{ text: "col" }] }],
                },
              ],
            };
  const siblings = parent.children as unknown[];
  const index = randomInt(rng, siblings.length + 1);
  siblings.splice(index, 0, child);
  return {
    kind: `forbidden ${kind}`,
    expectation: "rejected-or-repaired",
    description: `${kind} inside ${String(parent.type)}`,
    content,
  };
}

// Envelope mutations: the schema version and the envelope fields.
function mutateEnvelope(rng: Rng, content: unknown[]): Mutation {
  const choice = randomInt(rng, 3);
  if (choice === 0) {
    return {
      kind: "future schema version",
      expectation: "rejected-or-repaired",
      description: "schemaVersion = 2",
      content,
      schemaVersion: 2,
      hasSchemaVersion: true,
    };
  }
  if (choice === 1) {
    return {
      kind: "schema version as a string",
      expectation: "rejected-or-repaired",
      description: 'schemaVersion = "1"',
      content,
      schemaVersion: "1",
      hasSchemaVersion: true,
    };
  }
  return {
    kind: "schema version removed",
    expectation: "rejected-or-repaired",
    description: "schemaVersion removed",
    content,
    schemaVersion: undefined,
    hasSchemaVersion: false,
  };
}

function makeMutation(rng: Rng, base: EditorValue, group: "attribute" | "structure"): Mutation {
  const content = cloneValue(base) as unknown[];
  if (group === "attribute") {
    if (chance(rng, 0.2)) {
      return mutateEnvelope(rng, content);
    }
    const mutated = mutateAttribute(rng, content);
    return { ...mutated, schemaVersion: 1, hasSchemaVersion: true };
  }
  const mutated = mutateStructure(rng, content);
  return { ...mutated, schemaVersion: 1, hasSchemaVersion: true };
}

function envelopeOf(mutation: Mutation): Record<string, unknown> {
  const envelope: Record<string, unknown> = createEditorDocument(
    "fuzz",
    mutation.content as EditorValue,
  );
  if (!mutation.hasSchemaVersion) {
    delete envelope.schemaVersion;
  } else {
    envelope.schemaVersion = mutation.schemaVersion;
  }
  return envelope;
}

// Parse without letting a throw escape. A throw is a failure, reported with the seed and step.
function parseSafely(raw: unknown): ParseResult {
  return parseEditorDocument(raw);
}

function hasControlCharacter(node: unknown): boolean {
  if (Array.isArray(node)) {
    return node.some((child) => hasControlCharacter(child));
  }
  if (!isRecordValue(node)) {
    return typeof node === "string" && hasControlChar(node);
  }
  return Object.keys(node).some((key) => {
    if (key === "text" || key === "children") {
      return key === "children" ? hasControlCharacter(node[key]) : false;
    }
    return hasControlCharacter(node[key]);
  });
}

// Checks one mutation against the rules. Returns a description of the first violation, or undefined.
function violationFor(
  mutation: Mutation,
  result: ParseResult,
  originalText: string,
): string | undefined {
  if (result.status === "ok") {
    if (mutation.expectation === "rejected-or-repaired" && result.repairs.length === 0) {
      return `the schema requires a rejection or a reported repair, but the document opened with no repairs`;
    }
    const again = parseSafely(
      JSON.parse(JSON.stringify(createEditorDocument("fuzz", result.document.content))),
    );
    if (again.status !== "ok" || again.repairs.length > 0) {
      return `repair is not idempotent: the repaired document parses as ${again.status} with ${again.status === "ok" ? again.repairs.length : 0} repair(s)`;
    }
    if (JSON.stringify(result.document.content).includes("javascript:")) {
      return "a javascript: URL survived the repair";
    }
    if (hasControlCharacter(result.document.content)) {
      return "a control character survived in a stored string";
    }
    if (
      allTextOf(result.document.content).length < originalText.length &&
      result.repairs.length === 0
    ) {
      return "text was dropped without a reported repair";
    }

    const editor = createEditor(JSON.parse(JSON.stringify(result.document.content)) as EditorValue);
    editor.tf.normalize({ force: true });
    try {
      checkValid(snapshot(editor), "after normalize");
    } catch (error) {
      return `normalizing the repaired document leaves it invalid: ${String(error).slice(0, 160)}`;
    }
    return undefined;
  }

  // Checked through a loose view: the union narrows too far for the key checks below.
  const loose: Record<string, unknown> = { ...result };
  if (loose.status === "invalid" || loose.status === "unsupported") {
    const issues = loose.issues;
    if (!Array.isArray(issues) || issues.length === 0) {
      return `${String(loose.status)} result has no issues`;
    }
    if (!("raw" in loose)) {
      return `${String(loose.status)} result has no raw value`;
    }
    if ("document" in loose) {
      return `${String(loose.status)} result carries partially loaded content`;
    }
    if (mutation.expectation === "rejected-or-repaired" && issues.length === 0) {
      return "no issue reported";
    }
    return undefined;
  }

  if (loose.status === "future-version") {
    if (!(typeof loose.schemaVersion === "number" && loose.schemaVersion > 1)) {
      return `future-version reported for schemaVersion ${String(loose.schemaVersion)}`;
    }
    if ("document" in loose) {
      return "future-version result carries content";
    }
    return undefined;
  }

  return `unknown status ${String((result as { status: unknown }).status)}`;
}

function runFuzz(
  seed: number,
  base: EditorValue,
  group: "attribute" | "structure",
  count: number,
): void {
  const rng = mulberry32(seed);
  const originalText = allTextOf(base);
  const statuses = new Map<string, number>();
  for (let step = 0; step < count; step += 1) {
    const mutation = makeMutation(rng, base, group);
    const context = `seed ${seed}, step ${step}, ${mutation.kind} (${mutation.description})`;

    let result: ParseResult;
    try {
      result = parseSafely(envelopeOf(mutation));
    } catch (error) {
      throw new Error(`${context}: parseEditorDocument threw: ${String(error)}`);
    }

    if (!["ok", "invalid", "unsupported", "future-version"].includes(result.status)) {
      throw new Error(`${context}: unexpected status ${String(result.status)}`);
    }

    statuses.set(result.status, (statuses.get(result.status) ?? 0) + 1);

    const violation = violationFor(mutation, result, originalText);
    if (violation !== undefined) {
      throw new Error(
        `${context}: ${violation}. Status ${result.status}${result.status === "ok" ? ` with ${result.repairs.length} repair(s)` : `: ${describeIssues(result).slice(0, 160)}`}`,
      );
    }
  }

  // The seed must reach the rejecting paths, or the mutations are too weak to test anything.
  expect(statuses.get("unsupported") ?? 0, `seed ${seed}: no unsupported result`).toBeGreaterThan(
    0,
  );
  expect(statuses.get("invalid") ?? 0, `seed ${seed}: no invalid result`).toBeGreaterThan(0);
  expect(statuses.get("ok") ?? 0, `seed ${seed}: no repaired result`).toBeGreaterThan(0);
}

describe("fuzz: invalid input never crashes and never silently passes", () => {
  test("demo attribute mutations: 120 seeded mutations, each one rejected, repaired, or harmless", () => {
    runFuzz(1101, DEMO_DOCUMENT_VALUE as EditorValue, "attribute", 120);
  });

  test("demo structure mutations: 120 seeded mutations, each one rejected or repaired", () => {
    runFuzz(1202, DEMO_DOCUMENT_VALUE as EditorValue, "structure", 120);
  });

  test("worst-case attribute mutations: 100 seeded mutations, each one rejected, repaired, or harmless", () => {
    runFuzz(1303, WORST_CASE_VALUE, "attribute", 100);
  });

  test("worst-case structure mutations: 100 seeded mutations, each one rejected or repaired", () => {
    runFuzz(1404, WORST_CASE_VALUE, "structure", 100);
  });
});

describe("fuzz: the four statuses keep their documented shape", () => {
  test("a future schema version from the mutations reaches future-version", () => {
    const rng = mulberry32(1505);
    let seen = 0;
    for (let step = 0; step < 60; step += 1) {
      const mutation = mutateEnvelope(rng, cloneValue(DEMO_DOCUMENT_VALUE) as unknown[]);
      if (
        mutation.kind === "future schema version" &&
        parseSafely(envelopeOf(mutation)).status === "future-version"
      ) {
        seen += 1;
      }
    }
    expect(seen, "seed 1505: the envelope mutations never reached future-version").toBeGreaterThan(
      0,
    );
  });

  test("a document with a future schema version reports future-version and no content", () => {
    const envelope = createEditorDocument("future", DEMO_DOCUMENT_VALUE as EditorValue);
    const result = parseSafely({ ...envelope, schemaVersion: 2 });
    expect(result.status).toBe("future-version");
    expect("document" in result).toBe(false);
  });

  test("a text leaf with a number for text is invalid and returns the raw value", () => {
    const content = cloneValue(DEMO_DOCUMENT_VALUE) as unknown[];
    const leaf = leavesOf(content)[0];
    if (leaf === undefined) {
      throw new Error("The demo has no text leaf.");
    }
    leaf.text = 5;
    const envelope = createEditorDocument("bad-text", content as EditorValue);
    const result = parseSafely(envelope);
    expect(result.status).toBe("invalid");
    expect("document" in result).toBe(false);
  });

  test("an unknown block type is unsupported and keeps its raw value", () => {
    const content = cloneValue(DEMO_DOCUMENT_VALUE) as unknown[];
    const first = elementsOf(content)[0];
    if (first === undefined) {
      throw new Error("The demo has no element.");
    }
    first.type = "zz-unknown";
    const result = parseSafely(createEditorDocument("unknown", content as EditorValue));
    expect(result.status).toBe("unsupported");
    expect(isAllowedMark("zz-unknown")).toBe(false);
    expect(allowedElementAttrs("zz-unknown")).toBeUndefined();
    expect(isAllowedElementAttrValue("p", "align", "center")).toBe(true);
  });
});
