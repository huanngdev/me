import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

import { DEMO_DOCUMENT_VALUE } from "../demo/demo-document";
import type { EditorValue } from "../lib/document/editor-value";
import { exportEditorDocument } from "../lib/io/export-document";
import { importEditorDocument } from "../lib/io/import-document";
import { IO_ALL_NODES, IO_LOSSLESS_MARKDOWN } from "./fixtures/io-all-nodes";
import { codeLangFromToken } from "../lib/document/editor-document-schema";
import { comparableDocument, freezeDeep, plainBlocks } from "./io-test-utils";

const golden = readFileSync(path.join(import.meta.dir, "fixtures/io/all-nodes.md"), "utf8");

const paragraph = (text: string, extra: Record<string, unknown> = {}) => ({
  type: "p",
  id: "p",
  ...extra,
  children: [{ text }],
});

describe("markdown io", () => {
  test("export matches the golden file and does not mutate", async () => {
    const frozen = structuredClone(IO_ALL_NODES);
    freezeDeep(frozen);
    const first = await exportEditorDocument(frozen, "markdown");
    const second = await exportEditorDocument(frozen, "markdown");
    expect(first.content).toBe(golden);
    expect(second.content).toBe(first.content);
    expect(first.extension).toBe("md");
    expect(first.mimeType).toBe("text/markdown");
  });

  test("a lossless document round trips except ids", async () => {
    const exported = await exportEditorDocument(IO_LOSSLESS_MARKDOWN, "markdown");
    expect(exported.warnings).toEqual([]);
    const imported = await importEditorDocument(exported.content, "markdown");
    expect(imported.ok).toBe(true);
    if (!imported.ok) {
      return;
    }

    expect(comparableDocument(imported.value)).toEqual(comparableDocument(IO_LOSSLESS_MARKDOWN));
  });

  test("the demo keeps block text and the expected warnings", async () => {
    const exported = await exportEditorDocument(DEMO_DOCUMENT_VALUE, "markdown");
    const imported = await importEditorDocument(exported.content, "markdown");
    expect(imported.ok).toBe(true);
    if (!imported.ok) {
      return;
    }

    const exportedCodes = exported.warnings.map((warning) => warning.code).sort();
    expect(exportedCodes).toEqual(
      [
        "alignment",
        "block-color",
        "bookmark-details",
        "callout-icon",
        "columns-layout",
        "font-family",
        "font-size",
        "highlight",
        "line-height",
        "list-restart",
        "mention-link",
        "subscript",
        "superscript",
        "synced-unlinked",
        "table-merge",
        "table-widths",
        "text-color",
        "toc-omitted",
        "underline",
      ].sort(),
    );
    expect(plainBlocks(imported.value).join("\n")).toContain("Notion-like editor");
    expect(plainBlocks(imported.value).join("\n")).toContain("Tiếng Việt");

    const blockText = (node: {
      type?: string;
      text?: string;
      label?: string;
      texExpression?: string;
      title?: string;
      children?: unknown[];
    }): string => {
      if (typeof node.text === "string") {
        return node.text;
      }

      if (node.type === "mention" && typeof node.label === "string") {
        return `@${node.label}`;
      }

      if (node.type === "equation" && typeof node.texExpression === "string") {
        return node.texExpression;
      }

      if (node.type === "bookmark" && typeof node.title === "string") {
        return node.title;
      }

      return (node.children ?? []).map((child) => blockText(child as typeof node)).join("");
    };

    const leafTexts = (value: EditorValue): string[] => {
      const lines: string[] = [];
      const visit = (node: { type?: string; children?: unknown[] }): void => {
        if (node.type === "toc" || node.type === "synced_ref") {
          return;
        }

        const children = (node.children ?? []) as { type?: string; children?: unknown[] }[];
        const nested = children.some(
          (child) =>
            typeof child.type === "string" && child.type !== "a" && child.type !== "mention",
        );
        if (!nested) {
          lines.push(blockText(node));
          return;
        }

        for (const child of children) {
          visit(child);
        }
      };

      for (const block of value as { type?: string; children?: unknown[] }[]) {
        visit(block);
      }

      return lines;
    };

    // Exceptions, in order:
    // - toc is omitted
    // - synced_ref is omitted; Markdown writes that target again, so its text appears twice
    // - a merged table cell comes back as an extra empty cell (table-merge)
    // - a bookmark with no stored title comes back as its URL
    const expected = leafTexts(DEMO_DOCUMENT_VALUE);
    const release = expected.indexOf("Release plan");
    expected.splice(release + 1, 0, "");
    const now = expected.indexOf("Now");
    expected.splice(now + 1, 0, "");
    const plate = expected.indexOf("Plate");
    expected[plate + 1] = "https://example.com/not-in-the-preview-list";
    const synced = expected.indexOf("This callout is stored once. The reference below mirrors it.");
    expected.splice(synced, 0, "This callout is stored once. The reference below mirrors it.");
    expect(leafTexts(imported.value)).toEqual(expected);
  });

  test("lists round trip style, indent, checked, and start", async () => {
    const project = (value: EditorValue) => {
      const items: Record<string, unknown>[] = [];
      const visit = (nodes: readonly Record<string, unknown>[]): void => {
        for (const node of nodes) {
          if (typeof node.listStyleType === "string") {
            items.push({
              text: plainBlocks([node] as EditorValue).join(""),
              listStyleType: node.listStyleType,
              indent: node.indent,
              checked: node.checked,
              listStart: node.listStart,
            });
          }

          if (Array.isArray(node.children)) {
            visit(node.children as Record<string, unknown>[]);
          }
        }
      };

      visit(value as unknown as Record<string, unknown>[]);
      return items;
    };

    for (const source of [DEMO_DOCUMENT_VALUE, IO_ALL_NODES]) {
      const exported = await exportEditorDocument(source, "markdown");
      const imported = await importEditorDocument(exported.content, "markdown");
      expect(imported.ok).toBe(true);
      if (!imported.ok) {
        return;
      }

      const original = project(source).filter((item) => item.listStyleType !== "circle");
      expect(project(imported.value)).toEqual(original);
    }
  });

  test("nested toggles and a toggle heading round trip", async () => {
    const toggle = (
      summary: string,
      children: EditorValue,
      heading = false,
    ): EditorValue[number] => ({
      type: "toggle",
      id: "t",
      children: [
        heading
          ? { type: "h2", id: "h", children: [{ text: summary }] }
          : { type: "p", id: "s", children: [{ text: summary }] },
        ...children,
      ],
    });

    const nested = [
      toggle("Outer", [
        { type: "p", id: "a", children: [{ text: "outer line" }] },
        toggle("Middle", [
          { type: "p", id: "b", children: [{ text: "middle line" }] },
          toggle("Inner", [{ type: "p", id: "c", children: [{ text: "inner line" }] }]),
        ]),
      ]),
      toggle("Quote and list", [
        {
          type: "blockquote",
          id: "q",
          children: [{ type: "p", id: "qp", children: [{ text: "Quoted" }] }],
        },
        {
          type: "p",
          id: "li",
          indent: 1,
          listStyleType: "disc",
          children: [{ text: "Item" }],
        },
      ]),
      toggle("Section", [{ type: "p", id: "body", children: [{ text: "Inside" }] }], true),
    ] as EditorValue;

    const exported = await exportEditorDocument(nested, "markdown");
    expect(exported.warnings.some((warning) => warning.code === "toggle-heading")).toBe(false);
    const imported = await importEditorDocument(exported.content, "markdown");
    expect(imported.ok).toBe(true);
    if (!imported.ok) {
      return;
    }

    expect(comparableDocument(imported.value)).toEqual(comparableDocument(nested));
  });

  test("code fence aliases map to stored languages", async () => {
    const aliases = ["ts", "js", "sh", "shell", "py", "yml", "md"] as const;
    for (const alias of aliases) {
      const imported = await importEditorDocument(
        "```" + alias + "\nconst n = 1;\n```\n",
        "markdown",
      );
      expect(imported.ok).toBe(true);
      if (!imported.ok) {
        return;
      }

      expect(imported.value[0]).toMatchObject({ lang: codeLangFromToken(alias) });
      expect(imported.warnings.some((warning) => warning.code === "code-language")).toBe(false);
    }

    const unknown = await importEditorDocument("```cobol\nX\n```\n", "markdown");
    expect(unknown.ok).toBe(true);
    if (!unknown.ok) {
      return;
    }

    expect(unknown.warnings.some((warning) => warning.code === "code-language")).toBe(true);
  });

  test("a fourth toggle level folds into the third", async () => {
    const value = [
      {
        type: "toggle",
        id: "a",
        children: [
          { type: "p", id: "a1", children: [{ text: "One" }] },
          {
            type: "toggle",
            id: "b",
            children: [
              { type: "p", id: "b1", children: [{ text: "Two" }] },
              {
                type: "toggle",
                id: "c",
                children: [
                  { type: "p", id: "c1", children: [{ text: "Three" }] },
                  {
                    type: "toggle",
                    id: "d",
                    children: [
                      { type: "p", id: "d1", children: [{ text: "Four" }] },
                      { type: "p", id: "d2", children: [{ text: "Deep" }] },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ] as EditorValue;
    const exported = await exportEditorDocument(value, "markdown");
    const imported = await importEditorDocument(exported.content, "markdown");
    expect(imported.ok).toBe(true);
    if (!imported.ok) {
      return;
    }

    expect(imported.warnings.some((warning) => warning.code === "toggle-depth")).toBe(true);
    const deepest = (node: { type?: string; children?: unknown[] }, depth = 0): number => {
      const next = node.type === "toggle" ? depth + 1 : depth;
      const children = (node.children ?? []) as { type?: string; children?: unknown[] }[];
      return children.reduce((max, child) => Math.max(max, deepest(child, next)), next);
    };
    expect(deepest(imported.value[0] as { type?: string; children?: unknown[] })).toBe(3);
    expect(plainBlocks(imported.value).join("\n")).toContain("Deep");
  });

  test("each loss has a stable code", async () => {
    const cases: { value: EditorValue; code: string }[] = [
      { value: [paragraph("x", { indent: 1, listStyleType: "circle" })], code: "list-style" },
      {
        value: [
          {
            type: "table",
            id: "t",
            colSizes: [40],
            children: [
              {
                type: "tr",
                id: "r",
                children: [
                  {
                    type: "th",
                    id: "h",
                    colSpan: 2,
                    children: [paragraph("A"), paragraph("B")],
                  },
                ],
              },
            ],
          },
        ],
        code: "table-merge",
      },
      {
        value: [
          {
            type: "column_group",
            id: "c",
            children: [{ type: "column", id: "a", width: "100%", children: [paragraph("L")] }],
          },
        ],
        code: "columns-layout",
      },
      {
        value: [
          {
            type: "bookmark",
            id: "b",
            url: "https://example.com",
            title: "T",
            description: "D",
            children: [{ text: "" }],
          },
        ],
        code: "bookmark-details",
      },
      {
        value: [
          {
            type: "p",
            id: "p",
            children: [
              {
                type: "mention",
                id: "m",
                entityType: "person",
                entityId: "p1",
                label: "Ada",
                children: [{ text: "" }],
              },
            ],
          },
        ],
        code: "mention-link",
      },
      { value: [{ type: "toc", id: "toc", children: [{ text: "" }] }], code: "toc-omitted" },
      {
        value: [
          { type: "p", id: "target", children: [{ text: "Once" }] },
          { type: "synced_ref", id: "ref", targetBlockId: "target", children: [{ text: "" }] },
        ],
        code: "synced-unlinked",
      },
      {
        value: [{ type: "p", id: "p", children: [{ text: "u", underline: true }] }],
        code: "underline",
      },
      {
        value: [{ type: "p", id: "p", children: [{ text: "s", subscript: true }] }],
        code: "subscript",
      },
      {
        value: [{ type: "p", id: "p", children: [{ text: "s", superscript: true }] }],
        code: "superscript",
      },
      {
        value: [{ type: "p", id: "p", children: [{ text: "c", color: "red" }] }],
        code: "text-color",
      },
      {
        value: [{ type: "p", id: "p", children: [{ text: "c", backgroundColor: "yellow" }] }],
        code: "highlight",
      },
      {
        value: [{ type: "p", id: "p", children: [{ text: "c", fontSize: "12px" }] }],
        code: "font-size",
      },
      {
        value: [{ type: "p", id: "p", children: [{ text: "c", fontFamily: "mono" }] }],
        code: "font-family",
      },
      { value: [paragraph("Aligned", { align: "center" })], code: "alignment" },
      { value: [paragraph("Tall", { lineHeight: 2 })], code: "line-height" },
      { value: [paragraph("In", { indent: 2 })], code: "block-indent" },
      {
        value: [
          { type: "callout", id: "c", icon: "star", variant: "info", children: [paragraph("N")] },
        ],
        code: "callout-icon",
      },
      {
        value: [{ type: "callout", id: "c", variant: "nope", children: [paragraph("N")] }],
        code: "callout-tone",
      },
    ];

    for (const item of cases) {
      const exported = await exportEditorDocument(item.value as EditorValue, "markdown");
      const warning = exported.warnings.find((entry) => entry.code === item.code);
      expect(warning?.count).toBeGreaterThan(0);
    }
  });

  test("table widths and joined cells are warned", async () => {
    const exported = await exportEditorDocument(
      [
        {
          type: "table",
          id: "t",
          colSizes: [80, 80],
          children: [
            {
              type: "tr",
              id: "r",
              children: [
                { type: "td", id: "a", children: [paragraph("One"), paragraph("Two")] },
                {
                  type: "td",
                  id: "b",
                  align: "center",
                  children: [paragraph("Side", { align: "right" })],
                },
              ],
            },
          ],
        },
      ],
      "markdown",
    );
    expect(exported.warnings.map((warning) => warning.code).sort()).toEqual(
      ["table-blocks", "table-cell-style", "table-widths"].sort(),
    );
    expect(exported.content).toContain("One<br>Two");
  });

  test("a script and a javascript link import as safe text", async () => {
    const imported = await importEditorDocument(
      "<script>alert(1)</script>\n\n[x](javascript:alert(1))\n",
      "markdown",
    );
    expect(imported.ok).toBe(true);
    if (!imported.ok) {
      return;
    }

    const serialized = JSON.stringify(imported.value);
    expect(serialized).not.toContain("<script");
    expect(serialized).not.toContain("javascript:");
    expect(serialized).toContain("x");
    expect(imported.warnings.some((warning) => warning.code === "unsafe-link")).toBe(true);
  });

  test("headings deeper than 3 become heading 3", async () => {
    const imported = await importEditorDocument("#### Deep\n", "markdown");
    expect(imported.ok).toBe(true);
    if (!imported.ok) {
      return;
    }

    expect(imported.value[0]?.type).toBe("h3");
    expect(imported.warnings).toContainEqual(
      expect.objectContaining({ code: "heading-depth", count: 1 }),
    );
  });

  test("an image keeps its alt text", async () => {
    const imported = await importEditorDocument(
      "![picture](https://example.com/a.png)\n",
      "markdown",
    );
    expect(imported.ok).toBe(true);
    if (!imported.ok) {
      return;
    }

    expect(JSON.stringify(imported.value)).toContain("picture");
    expect(imported.warnings).toContainEqual(
      expect.objectContaining({
        code: "media-dropped",
        message: "Files and media are not supported yet.",
      }),
    );
  });

  test("literal markdown characters survive a round trip", async () => {
    const value = [{ type: "p", id: "p", children: [{ text: "* _ # | < ` 1. -" }] }];
    const exported = await exportEditorDocument(value, "markdown");
    const imported = await importEditorDocument(exported.content, "markdown");
    expect(imported.ok).toBe(true);
    if (!imported.ok) {
      return;
    }

    expect(JSON.stringify(imported.value)).toContain("* _ # | < ` 1. -");
  });

  test("vietnamese text and emoji survive", async () => {
    const value = [{ type: "p", id: "uni", children: [{ text: "Tiếng Việt \u0065\u0302 👩‍💻" }] }];
    const exported = await exportEditorDocument(value, "markdown");
    const imported = await importEditorDocument(exported.content, "markdown");
    expect(imported.ok).toBe(true);
    if (!imported.ok) {
      return;
    }

    expect(JSON.stringify(imported.value)).toContain("Tiếng Việt \u0065\u0302 👩‍💻");
  });
});
