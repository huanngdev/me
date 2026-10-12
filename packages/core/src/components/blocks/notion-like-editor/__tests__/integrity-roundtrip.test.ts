import { describe, expect, test } from "bun:test";
import { KEYS } from "platejs";

import { DEMO_DOCUMENT_VALUE } from "../demo/demo-document";
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

// Plate adds an empty paragraph after a table that ends a document (see the test.failing below).
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
  // DEFECT (unsure whether intended): Plate's trailing-block normalization appends an empty paragraph
  // when a table is the last block. The README and the feature inventory do not mention it.
  test.failing("a document that ends with a table loads unchanged", () => {
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
    expectNormalizationIsNoop(reloaded, "table at end");
  });

  // DEFECT: the validator accepts a block that starts with an inline element and no text leaf before it,
  // but Slate's normalizer inserts an empty text leaf there, so the editor opens a changed document.
  test.failing(
    "a paragraph that starts with a link loads unchanged (validator-ok input is not normalized)",
    () => {
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

      const reloaded = saveAndReload(content, "edge start");
      expectNormalizationIsNoop(reloaded, "edge start");
    },
  );
});

describe("save and reload: the root of a document", () => {
  // DEFECT: the validator checks what each container may hold, but not what the document root may hold.
  // A table row, a table cell or a code line at the top level is accepted with no repair, and the
  // editor then shows it as a block. Paste into a paragraph can produce such a code line (see integrity-clipboard).
  test.failing("the validator rejects structural-only nodes at the top level", () => {
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
    ];
    for (const node of orphans) {
      const document = createEditorDocument("orphan", [
        { type: KEYS.p, id: "orphan-lead", children: [{ text: "lead" }] },
        node,
      ] as unknown as EditorValue);
      expect(parseEditorDocument(document).status).not.toBe("ok");
    }
  });
});
