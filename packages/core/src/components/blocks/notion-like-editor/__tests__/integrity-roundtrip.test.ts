import { describe, expect, test } from "bun:test";
import { KEYS } from "platejs";

import { DEMO_DOCUMENT_VALUE } from "../demo/demo-document";
import { COLUMN_BARE } from "../lib/document/editor-column-repair";
import { createEditorDocument } from "../lib/document/editor-document";
import { parseEditorDocument } from "../lib/document/editor-document-validate";
import {
  FEATURE_INVENTORY,
  type FeatureEntry,
  type FeatureKind,
} from "../lib/document/feature-inventory";
import type { EditorValue } from "../lib/document/editor-value";
import {
  allElementIds,
  allTextOf,
  checkInvariants,
  cloneValue,
  describeIssues,
  firstDifference,
  isRecordValue,
  snapshot,
} from "./integrity-helpers";
import { WORST_CASE_VALUE } from "./integrity-fixtures";
import { createEditor } from "./test-utils";

// Compare two values as data. A failure names the label so the failing fixture is obvious.
function expectSame(actual: unknown, expected: unknown, label: string): void {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    return;
  }

  throw new Error(
    `${label}: content differs. ${firstDifference(expected, actual, { ignoreIds: false })}`,
  );
}

// Save, reload, and check the document the editor would open. Returns the reloaded content.
function saveAndReload(content: EditorValue, label: string): EditorValue {
  const saved = JSON.stringify(createEditorDocument("roundtrip", content));
  const parsed = parseEditorDocument(JSON.parse(saved));
  if (parsed.status !== "ok") {
    throw new Error(`${label}: reload is ${parsed.status}: ${describeIssues(parsed)}`);
  }

  if (parsed.repairs.length > 0) {
    throw new Error(
      `${label}: reload needed ${parsed.repairs.length} repair(s): ${describeIssues(parsed)}`,
    );
  }

  expectSame(parsed.document.content, content, `${label} after parse`);
  return parsed.document.content;
}

// Parse a document the editor did not save. It must be ok with no repairs. Returns the content it opens with.
function openAsOk(content: EditorValue, label: string): EditorValue {
  const parsed = parseEditorDocument(createEditorDocument("edge", content));
  if (parsed.status !== "ok") {
    throw new Error(`${label}: parse is ${parsed.status}: ${describeIssues(parsed)}`);
  }

  if (parsed.repairs.length > 0) {
    throw new Error(
      `${label}: parse needed ${parsed.repairs.length} repair(s): ${describeIssues(parsed)}`,
    );
  }

  return parsed.document.content;
}

// Load the reloaded content in an editor. Normalization must be a no-op, and running it again changes nothing.
function expectNormalizationIsNoop(content: EditorValue, label: string): void {
  const editor = createEditor(cloneValue(content));
  editor.tf.normalize({ force: true });
  expectSame(snapshot(editor), content, `${label} after the first normalize`);

  const once = snapshot(editor);
  editor.tf.normalize({ force: true });
  expectSame(snapshot(editor), once, `${label} after the second normalize`);
  checkInvariants(editor, `${label} after normalize`);
}

function roundTrip(content: EditorValue, label: string): void {
  const reloaded = saveAndReload(content, label);
  expectNormalizationIsNoop(reloaded, label);
}

// The block and everything it legally needs: a footnote definition for a reference, and a target for a synced reference.
function blockWithDependencies(id: string): EditorValue {
  const indexes = new Set<number>();
  const own = DEMO_DOCUMENT_VALUE.findIndex((block) => allElementIds(block).includes(id));
  if (own < 0) {
    throw new Error(`The demo has no block with the id ${id}.`);
  }
  indexes.add(own);

  const block = DEMO_DOCUMENT_VALUE[own];
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }

    if (!isRecordValue(node)) {
      return;
    }

    if (node.type === "footnote_ref" && typeof node.footnoteId === "string") {
      const footnoteId = node.footnoteId;
      const definition = DEMO_DOCUMENT_VALUE.findIndex(
        (candidate) => candidate.type === "footnote_def" && candidate.footnoteId === footnoteId,
      );
      if (definition >= 0) {
        indexes.add(definition);
      }
    }

    if (node.type === "synced_ref" && typeof node.targetBlockId === "string") {
      const targetId = node.targetBlockId;
      const target = DEMO_DOCUMENT_VALUE.findIndex((candidate) =>
        allElementIds(candidate).includes(targetId),
      );
      if (target >= 0) {
        indexes.add(target);
      }
    }

    visit(node.children);
  };
  visit(block);

  return [...indexes]
    .sort((a, b) => a - b)
    .map((index) => cloneValue(DEMO_DOCUMENT_VALUE[index])) as EditorValue;
}

// The editor adds an empty paragraph after a table that ends a document (ensureParagraphAfterTable).
// Feature documents end with that paragraph so the per-feature check stays strict about the feature.
function withTrailingParagraphAfterTable(content: EditorValue): EditorValue {
  const last = content[content.length - 1];
  if (!isRecordValue(last) || last.type !== KEYS.table) {
    return content;
  }

  return [
    ...content,
    { type: KEYS.p, id: "feature-trailing", children: [{ text: "" }] },
  ] as EditorValue;
}

function featuresOf(kind: FeatureKind): FeatureEntry[] {
  return FEATURE_INVENTORY.filter(
    (entry) => entry.kind === kind && entry.demoBlockId !== undefined,
  );
}

describe("save and reload: whole documents", () => {
  test("the demo document saves, reloads as ok with no repairs, and normalizes to itself", () => {
    roundTrip(DEMO_DOCUMENT_VALUE as EditorValue, "demo document");
  });

  test("the worst-case fixture saves, reloads as ok with no repairs, and normalizes to itself", () => {
    roundTrip(WORST_CASE_VALUE, "worst-case fixture");
  });

  test("the worst-case fixture keeps its long paragraph, Vietnamese, CJK, RTL and emoji text intact", () => {
    const text = allTextOf(saveAndReload(WORST_CASE_VALUE, "worst-case text"));

    expect(text).toContain("abcdefghij".repeat(500));
    expect(text).toContain("编辑器文档与段落");
    expect(text).toContain("\u{1F469}‍\u{1F4BB}");
    expect(text).toContain("مرحبا بالعالم");
    expect(text).toContain("Tiếng Việt".normalize("NFD"));
  });
});

describe("save and reload: every stored feature", () => {
  test("block features round-trip on their own", () => {
    for (const entry of featuresOf("block")) {
      roundTrip(
        withTrailingParagraphAfterTable(blockWithDependencies(String(entry.demoBlockId))),
        `block ${entry.key}`,
      );
    }
  });

  test("inline features round-trip on their own", () => {
    for (const entry of featuresOf("inline")) {
      roundTrip(
        withTrailingParagraphAfterTable(blockWithDependencies(String(entry.demoBlockId))),
        `inline ${entry.key}`,
      );
    }
  });

  test("text marks round-trip on their own", () => {
    for (const entry of featuresOf("mark")) {
      roundTrip(
        withTrailingParagraphAfterTable(blockWithDependencies(String(entry.demoBlockId))),
        `mark ${entry.key}`,
      );
    }
  });

  test("block attributes round-trip on their own", () => {
    for (const entry of featuresOf("block-attribute")) {
      roundTrip(
        withTrailingParagraphAfterTable(blockWithDependencies(String(entry.demoBlockId))),
        `attribute ${entry.key}`,
      );
    }
  });

  test("every feature with a demo block id names a block the demo contains", () => {
    for (const entry of FEATURE_INVENTORY) {
      if (entry.demoBlockId === undefined) {
        continue;
      }

      expect(allElementIds(DEMO_DOCUMENT_VALUE)).toContain(entry.demoBlockId);
    }
  });
});

describe("save and reload: documented edge cases", () => {
  // A root table is always followed by one empty paragraph, which is where the caret goes below it.
  test("a document that ends with a table gets exactly one empty paragraph after it", () => {
    const content: EditorValue = [
      { type: KEYS.p, id: "table-end-p", children: [{ text: "before" }] },
      {
        type: KEYS.table,
        id: "table-end",
        children: [
          {
            type: KEYS.tr,
            id: "table-end-row",
            children: [
              {
                type: KEYS.td,
                id: "table-end-cell",
                children: [{ type: KEYS.p, id: "table-end-cell-p", children: [{ text: "cell" }] }],
              },
            ],
          },
        ],
      },
    ] as unknown as EditorValue;

    const reloaded = saveAndReload(content, "table at end");
    const editor = createEditor(cloneValue(reloaded));
    editor.tf.normalize({ force: true });
    const once = snapshot(editor);
    expectSame(once.slice(0, content.length), content, "table at end: original blocks");
    expect(once).toHaveLength(content.length + 1);
    expect(once.at(-1)).toMatchObject({ type: KEYS.p, children: [{ text: "" }] });

    editor.tf.normalize({ force: true });
    expectSame(snapshot(editor), once, "table at end: second normalize");
    checkInvariants(editor, "table at end");
  });

  // The validator adds the empty text leaves Slate needs around inline elements, so the editor changes nothing on open.
  test("a paragraph that starts with a link loads unchanged (validator-ok input is not normalized)", () => {
    const content: EditorValue = [
      {
        type: KEYS.p,
        id: "edge-start",
        children: [
          {
            type: KEYS.link,
            id: "edge-link",
            url: "https://example.com",
            children: [{ text: "go" }],
          },
          { text: " then more" },
        ],
      },
    ] as unknown as EditorValue;

    const opened = openAsOk(content, "edge start");
    expectSame(
      opened,
      [
        {
          type: KEYS.p,
          id: "edge-start",
          children: [
            { text: "" },
            {
              type: KEYS.link,
              id: "edge-link",
              url: "https://example.com",
              children: [{ text: "go" }],
            },
            { text: " then more" },
          ],
        },
      ],
      "edge start leaves",
    );
    expectNormalizationIsNoop(opened, "edge start");
  });

  test("a paragraph that ends with a link gets an empty leaf after it", () => {
    const opened = openAsOk(
      [
        {
          type: KEYS.p,
          id: "edge-end",
          children: [
            { text: "see " },
            {
              type: KEYS.link,
              id: "edge-end-link",
              url: "https://example.com",
              children: [{ text: "go" }],
            },
          ],
        },
      ] as unknown as EditorValue,
      "edge end",
    );
    expectSame(
      opened,
      [
        {
          type: KEYS.p,
          id: "edge-end",
          children: [
            { text: "see " },
            {
              type: KEYS.link,
              id: "edge-end-link",
              url: "https://example.com",
              children: [{ text: "go" }],
            },
            { text: "" },
          ],
        },
      ],
      "edge end leaves",
    );
    expectNormalizationIsNoop(opened, "edge end");
  });

  // Two inline elements side by side get an empty leaf between them. A void keeps its one empty leaf.
  test("two adjacent inline elements get an empty leaf between them and none inside the void", () => {
    const opened = openAsOk(
      [
        {
          type: KEYS.p,
          id: "edge-adjacent",
          children: [
            { text: "due " },
            {
              type: KEYS.link,
              id: "edge-adjacent-link",
              url: "https://example.com",
              children: [{ text: "go" }],
            },
            {
              type: KEYS.date,
              id: "edge-adjacent-date",
              date: "2026-10-12",
              children: [{ text: "" }],
            },
          ],
        },
      ] as unknown as EditorValue,
      "edge adjacent",
    );
    expectSame(
      opened,
      [
        {
          type: KEYS.p,
          id: "edge-adjacent",
          children: [
            { text: "due " },
            {
              type: KEYS.link,
              id: "edge-adjacent-link",
              url: "https://example.com",
              children: [{ text: "go" }],
            },
            { text: "" },
            {
              type: KEYS.date,
              id: "edge-adjacent-date",
              date: "2026-10-12",
              children: [{ text: "" }],
            },
            { text: "" },
          ],
        },
      ],
      "edge adjacent leaves",
    );
    expectNormalizationIsNoop(opened, "edge adjacent");
  });

  // The same rule applies to a paragraph inside a callout and to a paragraph inside a table cell.
  test("inline elements inside a callout and a table cell get the leaves too", () => {
    const linkNode = (id: string) => ({
      type: KEYS.link,
      id,
      url: "https://example.com",
      children: [{ text: "go" }],
    });
    const opened = openAsOk(
      [
        {
          type: KEYS.callout,
          id: "edge-callout",
          children: [
            {
              type: KEYS.p,
              id: "edge-callout-p",
              children: [linkNode("edge-callout-link"), { text: " note" }],
            },
          ],
        },
        {
          type: KEYS.table,
          id: "edge-table",
          children: [
            {
              type: KEYS.tr,
              id: "edge-row",
              children: [
                {
                  type: KEYS.td,
                  id: "edge-cell",
                  children: [
                    {
                      type: KEYS.p,
                      id: "edge-cell-p",
                      children: [{ text: "cell " }, linkNode("edge-cell-link")],
                    },
                  ],
                },
              ],
            },
          ],
        },
        // A table that ends the document gets a trailing paragraph from the editor, so one follows it here.
        { type: KEYS.p, id: "edge-tail", children: [{ text: "end" }] },
      ] as unknown as EditorValue,
      "edge nested",
    );
    expectSame(
      opened,
      [
        {
          type: KEYS.callout,
          id: "edge-callout",
          children: [
            {
              type: KEYS.p,
              id: "edge-callout-p",
              children: [{ text: "" }, linkNode("edge-callout-link"), { text: " note" }],
            },
          ],
        },
        {
          type: KEYS.table,
          id: "edge-table",
          children: [
            {
              type: KEYS.tr,
              id: "edge-row",
              children: [
                {
                  type: KEYS.td,
                  id: "edge-cell",
                  children: [
                    {
                      type: KEYS.p,
                      id: "edge-cell-p",
                      children: [{ text: "cell " }, linkNode("edge-cell-link"), { text: "" }],
                    },
                  ],
                },
              ],
            },
          ],
        },
        { type: KEYS.p, id: "edge-tail", children: [{ text: "end" }] },
      ],
      "edge nested leaves",
    );
    expectNormalizationIsNoop(opened, "edge nested");
  });

  test("the demo document parses to a deeply equal value", () => {
    const opened = openAsOk(DEMO_DOCUMENT_VALUE as EditorValue, "demo document");
    expectSame(opened, DEMO_DOCUMENT_VALUE, "demo document after parse");
  });
});

describe("save and reload: the root of a document", () => {
  // The document root may not hold a node that only exists inside a parent. The validator reports it as unsupported.
  test("the validator rejects structural-only nodes at the top level", () => {
    const orphans: unknown[] = [
      { type: KEYS.codeLine, id: "orphan-line", children: [{ text: "line" }] },
      {
        type: KEYS.tr,
        id: "orphan-row",
        children: [
          {
            type: KEYS.td,
            id: "orphan-cell",
            children: [{ type: KEYS.p, id: "orphan-cell-p", children: [{ text: "cell" }] }],
          },
        ],
      },
      {
        type: KEYS.td,
        id: "orphan-td",
        children: [{ type: KEYS.p, id: "orphan-td-p", children: [{ text: "cell" }] }],
      },
      {
        type: KEYS.th,
        id: "orphan-th",
        children: [{ type: KEYS.p, id: "orphan-th-p", children: [{ text: "heading" }] }],
      },
    ];
    for (const node of orphans) {
      const document = createEditorDocument("orphan", [
        { type: KEYS.p, id: "orphan-lead", children: [{ text: "lead" }] },
        node,
      ] as unknown as EditorValue);
      expect(parseEditorDocument(document).status).toBe("unsupported");
    }
  });

  // A bare column is unwrapped by the column repair before the root check runs, so it opens as its blocks.
  test("a column at the top level is unwrapped into its blocks", () => {
    const parsed = parseEditorDocument(
      createEditorDocument("orphan", [
        {
          type: KEYS.column,
          id: "orphan-column",
          width: "100%",
          children: [{ type: KEYS.p, id: "orphan-column-p", children: [{ text: "inside" }] }],
        },
      ] as unknown as EditorValue),
    );
    if (parsed.status !== "ok") {
      throw new Error(`top-level column: parse is ${parsed.status}`);
    }

    expect(parsed.document.content).toEqual([
      { type: KEYS.p, id: "orphan-column-p", children: [{ text: "inside" }] },
    ]);
    expect(parsed.repairs.map((repair) => repair.message)).toContain(COLUMN_BARE);
  });
});
