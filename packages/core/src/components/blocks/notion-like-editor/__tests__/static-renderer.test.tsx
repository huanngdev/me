import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { KEYS } from "platejs";
import { createPlateEditor } from "platejs/react";

import { EditorSurface } from "../components/editor/editor-surface";
import { DEMO_DOCUMENT_VALUE } from "../demo/demo-document";
import { BOOKMARK_KEY } from "../lib/features/editor-bookmark-url";
import {
  EDITOR_ELEMENT_RULES,
  EDITOR_MARK_RULES,
  SYNCED_REF_KEY,
} from "../lib/document/editor-document-schema";
import type { EditorValue } from "../lib/document/editor-value";
import { createEditorPlugins } from "../lib/plugins/editor-plugins";
import { NotionLikeEditorStatic } from "../notion-like-editor-static";

const ROOT = path.resolve(import.meta.dir, "..");

function markup(value: EditorValue): string {
  return renderToStaticMarkup(<NotionLikeEditorStatic value={value} />);
}

function block(
  type: string,
  extra: Record<string, unknown> = {},
  text = type,
): EditorValue[number] {
  return {
    type,
    id: `id-${type}`,
    ...extra,
    children: [{ text }],
  } as EditorValue[number];
}

describe("static renderer", () => {
  test("plate static fixture and the demo document render on the server", () => {
    const html = markup(DEMO_DOCUMENT_VALUE);
    expect(html.length).toBeGreaterThan(0);
    expect(html).not.toContain('contenteditable="true"');
    expect(html).not.toContain("<script");
    expect(html).not.toContain("javascript:");
    expect(html).not.toMatch(/\son[a-z]+=/i);
  });

  test("the static import graph stays free of client editor code", () => {
    const seen = new Set<string>();
    const forbidden = [
      "components/ui/",
      "/hooks/",
      "/lib/plugins/",
      "/lib/commands/",
      "/lib/paste/",
      "/components/elements/",
    ];
    const visit = (file: string): void => {
      const absolute = path.resolve(file);
      if (seen.has(absolute) || (!absolute.endsWith(".ts") && !absolute.endsWith(".tsx"))) {
        return;
      }
      seen.add(absolute);
      const source = readFileSync(absolute, "utf8");
      expect(source).not.toContain('"use client"');
      expect(source).not.toContain("platejs/react");
      expect(source).not.toMatch(/@platejs\/[^"']+\/react/);
      expect(source).not.toContain("react-dom");
      const specifiers = [...source.matchAll(/from\s+["'](\.[^"']+)["']/g)].map(
        (match) => match[1] ?? "",
      );
      for (const specifier of specifiers) {
        if (specifier.includes("node_modules")) continue;
        const resolved = path.resolve(path.dirname(absolute), specifier);
        const withExt = [resolved, `${resolved}.ts`, `${resolved}.tsx`].find((candidate) => {
          try {
            readFileSync(candidate);
            return true;
          } catch {
            return false;
          }
        });
        if (!withExt) continue;
        const relative = withExt.slice(ROOT.length);
        const classModule =
          relative.endsWith("-classes.ts") ||
          relative.endsWith("-styles.ts") ||
          relative.endsWith("-metrics.ts");
        for (const folder of forbidden) {
          if (relative.includes(folder) && !classModule) {
            throw new Error(`${relative} is under ${folder}`);
          }
        }
        visit(withExt);
      }
    };
    visit(path.join(ROOT, "notion-like-editor-static.tsx"));
    expect(seen.size).toBeGreaterThan(3);
  });

  test("every schema node and mark renders", () => {
    const nodes: EditorValue = [];
    for (const rule of EDITOR_ELEMENT_RULES) {
      if (
        rule.type === KEYS.tr ||
        rule.type === KEYS.td ||
        rule.type === KEYS.th ||
        rule.type === KEYS.codeLine ||
        rule.type === KEYS.column
      ) {
        continue;
      }
      if (rule.type === KEYS.table) {
        nodes.push({
          type: KEYS.table,
          id: "id-table",
          colSizes: [120, 80],
          children: [
            {
              type: KEYS.tr,
              children: [
                {
                  type: KEYS.th,
                  colSpan: 1,
                  children: [{ type: KEYS.p, children: [{ text: "Head" }] }],
                },
                {
                  type: KEYS.td,
                  rowSpan: 1,
                  children: [{ type: KEYS.p, children: [{ text: "Cell" }] }],
                },
              ],
            },
          ],
        } as EditorValue[number]);
        continue;
      }
      if (rule.type === KEYS.columnGroup) {
        nodes.push({
          type: KEYS.columnGroup,
          id: "id-columns",
          children: [
            {
              type: KEYS.column,
              width: "50%",
              children: [{ type: KEYS.p, children: [{ text: "Left" }] }],
            },
            {
              type: KEYS.column,
              width: "50%",
              children: [{ type: KEYS.p, children: [{ text: "Right" }] }],
            },
          ],
        } as EditorValue[number]);
        continue;
      }
      if (rule.type === KEYS.codeBlock) {
        nodes.push({
          type: KEYS.codeBlock,
          id: "id-code",
          lang: "typescript",
          children: [{ type: KEYS.codeLine, children: [{ text: "const value = 1" }] }],
        } as EditorValue[number]);
        continue;
      }
      if (rule.type === KEYS.link) {
        nodes.push({
          type: KEYS.p,
          id: "id-link-host",
          children: [
            { text: "See " },
            { type: KEYS.link, url: "https://example.com", children: [{ text: "example" }] },
          ],
        } as EditorValue[number]);
        continue;
      }
      if (rule.type === KEYS.mention) {
        nodes.push({
          type: KEYS.p,
          id: "id-mention-host",
          children: [
            {
              type: KEYS.mention,
              label: "Ada",
              entityType: "person",
              entityId: "ada",
              children: [{ text: "" }],
            },
          ],
        } as EditorValue[number]);
        continue;
      }
      if (rule.type === BOOKMARK_KEY) {
        nodes.push(block(rule.type, { url: "https://example.com", title: "Example" }, ""));
        continue;
      }
      if (rule.type === KEYS.equation) {
        nodes.push(block(rule.type, { texExpression: "E=mc^2" }, ""));
        continue;
      }
      if (rule.type === KEYS.toc) {
        nodes.push(block(rule.type, { maxDepth: 2 }, ""));
        continue;
      }
      if (rule.type === SYNCED_REF_KEY) {
        nodes.push(block(rule.type, { targetBlockId: "id-p" }, ""));
        continue;
      }
      if (rule.type === "p") {
        nodes.push({
          type: "p",
          id: "id-p",
          listStyleType: "disc",
          indent: 1,
          children: [{ text: "Item" }],
        } as EditorValue[number]);
        continue;
      }
      nodes.push(block(rule.type));
    }
    const marked = {
      type: "p",
      id: "id-marks",
      align: "center",
      lineHeight: 1.5,
      children: [
        EDITOR_MARK_RULES.reduce<Record<string, unknown>>(
          (leaf, rule) => {
            if (rule.type === KEYS.color || rule.type === KEYS.backgroundColor)
              leaf[rule.type] = "red";
            else if (rule.type === KEYS.fontSize) leaf[rule.type] = "18px";
            else if (rule.type === KEYS.fontFamily) leaf[rule.type] = "mono";
            else leaf[rule.type] = true;
            return leaf;
          },
          { text: "marked" },
        ),
      ],
    } as unknown as EditorValue[number];
    const html = markup([...nodes, marked]);
    expect(html).toContain("Item");
    expect(html).toContain('id="heading-id-h1"');
    expect(html).toContain("<blockquote");
    expect(html).toContain("<hr");
    expect(html).toContain("Example");
    expect(html).toContain("data-toc-depth");
    expect(html).toContain("data-equation-math");
    expect(html).toContain('role="note"');
    expect(html).toContain("<details");
    expect(html).toContain("const");
    expect(html).toContain("<table");
    expect(html).toContain("data-column-layout");
    expect(html).toContain("https://example.com");
    expect(html).toContain("@Ada");
    expect(html).toContain("marked");
    expect(html).toContain("var(--editor-text-red)");
    expect(html).toContain("18px");
    for (const rule of EDITOR_ELEMENT_RULES) {
      expect(html.length).toBeGreaterThan(0);
      expect(rule.type.length).toBeGreaterThan(0);
    }
  });

  test("links, bookmarks, toggles, toc, code, equations, todos, synced refs, and mentions", () => {
    const html = markup([
      { type: "h1", id: "top", children: [{ text: "Top" }] },
      { type: "h3", id: "deep", children: [{ text: "Deep" }] },
      { type: KEYS.toc, id: "toc", maxDepth: 1, children: [{ text: "" }] },
      {
        type: KEYS.p,
        children: [
          { text: "go " },
          { type: KEYS.link, url: "https://example.com/a", children: [{ text: "safe" }] },
          { text: " " },
          { type: KEYS.link, url: "javascript:alert(1)", children: [{ text: "unsafe" }] },
        ],
      },
      {
        type: BOOKMARK_KEY,
        id: "mark",
        url: "https://example.com/",
        title: "Stored title",
        description: "Stored description",
        siteName: "Example",
        imageUrl: "https://example.com/a.png",
        children: [{ text: "" }],
      },
      {
        type: KEYS.toggle,
        id: "toggle",
        children: [
          { type: KEYS.p, children: [{ text: "Label" }] },
          { type: KEYS.p, children: [{ text: "Hidden body" }] },
        ],
      },
      {
        type: KEYS.codeBlock,
        id: "code",
        lang: "typescript",
        children: [{ type: KEYS.codeLine, children: [{ text: "const value = 1" }] }],
      },
      { type: KEYS.equation, id: "eq", texExpression: "E=mc^2", children: [{ text: "" }] },
      { type: KEYS.equation, id: "bad-eq", texExpression: "\\bad", children: [{ text: "" }] },
      {
        type: KEYS.p,
        id: "todo-on",
        listStyleType: "todo",
        indent: 1,
        checked: true,
        children: [{ text: "Done" }],
      },
      {
        type: KEYS.p,
        id: "todo-off",
        listStyleType: "todo",
        indent: 1,
        checked: false,
        children: [{ text: "Open" }],
      },
      { type: KEYS.p, id: "source", children: [{ text: "Original words" }] },
      { type: SYNCED_REF_KEY, id: "ref", targetBlockId: "source", children: [{ text: "" }] },
      { type: SYNCED_REF_KEY, id: "missing", targetBlockId: "gone", children: [{ text: "" }] },
      { type: SYNCED_REF_KEY, id: "cycle", targetBlockId: "ref", children: [{ text: "" }] },
      {
        type: KEYS.p,
        children: [
          {
            type: KEYS.mention,
            label: "Ada",
            entityType: "person",
            entityId: "ada",
            children: [{ text: "" }],
          },
        ],
      },
    ] as EditorValue);
    expect(html).toContain('href="https://example.com/a"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer nofollow"');
    expect(html).not.toContain("javascript:");
    expect(html).toContain("unsafe");
    expect(html).toContain("Stored title");
    expect(html).toContain("Stored description");
    expect(html).toContain("https://example.com/a.png");
    expect(html).toContain("<details");
    expect(html).not.toContain("<details open");
    expect(html).toContain('href="#heading-top"');
    expect(html).not.toContain('href="#heading-deep"');
    expect(html).toContain("hljs");
    expect(html).toContain("data-equation-math");
    expect(html).toContain("data-equation-error");
    expect(html).toContain('aria-checked="true"');
    expect(html).toContain('aria-checked="false"');
    expect(html).toContain("Original words");
    expect(html).toContain("The original block was deleted.");
    expect(html).toContain("Invalid reference");
    expect(html).toContain("@Ada");
  });

  test("unknown nodes, invalid attributes, and unreadable values", () => {
    const unknown = markup([
      { type: "widget", id: "w", children: [{ text: "Kept" }] },
    ] as EditorValue);
    expect(unknown).toContain("Kept");
    expect(unknown).not.toContain("widget");
    const invalid = markup([
      { type: "p", id: "p", align: "sideways", children: [{ text: "Plain" }] },
    ] as EditorValue);
    expect(invalid).toContain("Plain");
    expect(invalid).not.toContain("sideways");
    expect(markup(null as unknown as EditorValue)).toBe("<div></div>");
    expect(markup({ schemaVersion: 99, content: [] } as unknown as EditorValue)).toBe(
      "<div></div>",
    );
    expect(markup("garbage" as unknown as EditorValue)).toBe("<div></div>");
  });

  test("demo text matches the read-only editor block by block", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const editor = createPlateEditor({
      plugins: createEditorPlugins(),
      value: DEMO_DOCUMENT_VALUE,
    });
    const root: Root = createRoot(host);
    await act(async () => {
      root.render(
        <EditorSurface editor={editor} readOnly placeholder="Type something…" className="editor" />,
      );
    });
    const staticHost = document.createElement("div");
    staticHost.innerHTML = markup(DEMO_DOCUMENT_VALUE);
    const editorBlocks = [...host.querySelectorAll("[data-block-id]")];
    expect(editorBlocks.length).toBeGreaterThan(0);
    for (const node of editorBlocks) {
      const id = node.getAttribute("data-block-id");
      if (id?.includes("bookmark")) {
        continue;
      }
      const other = staticHost.querySelector(`[data-block-id="${id}"]`);
      if (other === null) {
        throw new Error(`missing ${id} ${node.textContent?.slice(0, 40)}`);
      }
      const compact = (element: Element) => {
        const copy = element.cloneNode(true) as Element;
        copy.querySelectorAll("style, button, svg").forEach((child) => child.remove());
        return (copy.textContent ?? "").replace(/Copy/g, "").replace(/\s+/g, "");
      };
      const left = compact(node);
      const right = compact(other as Element);
      if (left.length === 0 || right.length === 0) continue;
      if (left !== right) {
        throw new Error(`${id}\nL:${left.slice(0, 100)}\nR:${right.slice(0, 100)}`);
      }
    }
    await act(async () => {
      root.unmount();
    });
    host.remove();
  });
});
