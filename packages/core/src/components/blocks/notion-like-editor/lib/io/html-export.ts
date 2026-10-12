import { KEYS } from "platejs";

import { headingAnchorId } from "../features/heading-anchor";
import { BOOKMARK_KEY } from "../features/editor-bookmark-url";
import { sanitizeLinkUrl } from "../features/editor-link-url";
import { tocEntriesFromValue } from "../features/editor-toc-outline";
import {
  FONT_FAMILIES,
  FONT_SIZES,
  LINE_HEIGHTS,
  PALETTE_TOKENS,
  SYNCED_REF_KEY,
  TEXT_ALIGNS,
  type FontFamily,
  type PaletteToken,
} from "../document/editor-document-schema";
import type { EditorValue } from "../document/editor-value";
import { createWarnings, plural, type IoExportOptions, type IoExportResult } from "./io-types";

const COLOR_CSS: Record<PaletteToken, string> = {
  gray: "#787774",
  brown: "#9f6b53",
  orange: "#d9730d",
  yellow: "#cb912f",
  green: "#448361",
  blue: "#337ea9",
  purple: "#9065b0",
  pink: "#c14c8a",
  red: "#d44c47",
};

const FONT_CSS: Record<FontFamily, string> = {
  sans: "sans-serif",
  serif: "serif",
  mono: "monospace",
};

type Node = Record<string, unknown> & {
  type?: string;
  children?: Node[];
  text?: string;
};

function isRecord(value: unknown): value is Node {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nodesOf(value: EditorValue): Node[] {
  return value as unknown as Node[];
}

function childrenOf(node: Node): Node[] {
  return Array.isArray(node.children) ? node.children.filter(isRecord) : [];
}

function escapeText(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function attr(name: string, value: string): string {
  return ` ${name}="${escapeText(value)}"`;
}

function plainText(node: Node): string {
  if (typeof node.text === "string") {
    return node.text;
  }

  return childrenOf(node)
    .map((child) => plainText(child))
    .join("");
}

function findNode(value: readonly Node[], id: string): Node | undefined {
  for (const node of value) {
    if (node.id === id) {
      return node;
    }

    const nested = findNode(childrenOf(node), id);
    if (nested !== undefined) {
      return nested;
    }
  }

  return undefined;
}

function firstHeading(value: readonly Node[]): string | undefined {
  for (const node of value) {
    if (node.type === KEYS.h1 || node.type === KEYS.h2 || node.type === KEYS.h3) {
      const text = plainText(node).trim();
      if (text.length > 0) {
        return text;
      }
    }

    const nested = firstHeading(childrenOf(node));
    if (nested !== undefined) {
      return nested;
    }
  }

  return undefined;
}

function styleAttribute(declarations: readonly string[]): string {
  if (declarations.length === 0) {
    return "";
  }

  return attr("style", declarations.join("; "));
}

function idAttr(node: Node): string {
  return typeof node.id === "string" && node.id.length > 0 ? attr("data-nle-id", node.id) : "";
}

function blockStyle(node: Node): string {
  const declarations: string[] = [];
  if (typeof node.align === "string" && TEXT_ALIGNS.some((align) => align === node.align)) {
    declarations.push(`text-align: ${node.align}`);
  }

  if (LINE_HEIGHTS.some((height) => height === node.lineHeight)) {
    declarations.push(`line-height: ${String(node.lineHeight)}`);
  }

  return styleAttribute(declarations);
}

function renderInlines(nodes: readonly Node[], inTable: boolean): string {
  return nodes.map((node) => renderInline(node, inTable)).join("");
}

function renderInline(node: Node, inTable: boolean): string {
  if (typeof node.text === "string") {
    const parts = node.text.split("\n");
    let html = parts.map((part) => escapeText(part)).join("<br>");
    const wrappers: string[] = [];
    if (node.code === true) wrappers.push("code");
    if (node.strikethrough === true) wrappers.push("s");
    if (node.italic === true) wrappers.push("em");
    if (node.bold === true) wrappers.push("strong");
    if (node.underline === true) wrappers.push("u");
    if (node.superscript === true) wrappers.push("sup");
    if (node.subscript === true) wrappers.push("sub");
    for (const tag of wrappers) {
      html = `<${tag}>${html}</${tag}>`;
    }

    const declarations: string[] = [];
    if (PALETTE_TOKENS.some((token) => token === node.color)) {
      declarations.push(`color: ${COLOR_CSS[node.color as PaletteToken]}`);
    }

    if (PALETTE_TOKENS.some((token) => token === node.backgroundColor)) {
      declarations.push(`background-color: ${COLOR_CSS[node.backgroundColor as PaletteToken]}`);
    }

    if (FONT_SIZES.some((size) => size === node.fontSize)) {
      declarations.push(`font-size: ${String(node.fontSize)}`);
    }

    if (FONT_FAMILIES.some((family) => family === node.fontFamily)) {
      declarations.push(`font-family: ${FONT_CSS[node.fontFamily as FontFamily]}`);
    }

    if (declarations.length > 0) {
      html = `<span${styleAttribute(declarations)}>${html}</span>`;
    }

    return html;
  }

  if (node.type === KEYS.mention) {
    const label = typeof node.label === "string" ? node.label : "";
    const id = typeof node.entityId === "string" ? node.entityId : "";
    return `<span data-nle-mention${idAttr(node)}${attr("data-id", id)}>@${escapeText(label)}</span>`;
  }

  if (node.type === KEYS.inlineEquation) {
    const tex = typeof node.texExpression === "string" ? node.texExpression : "";
    return `<span data-nle-inline-equation${idAttr(node)}>${escapeText(tex)}</span>`;
  }

  if (node.type === KEYS.link || node.type === "a") {
    const url = typeof node.url === "string" ? node.url : "";
    const safe = sanitizeLinkUrl(url);
    const inner = renderInlines(childrenOf(node), inTable);
    if (safe === undefined) {
      return inner;
    }

    return `<a${idAttr(node)}${attr("href", safe)}>${inner}</a>`;
  }

  return renderInlines(childrenOf(node), inTable);
}

function isListItem(node: Node): boolean {
  return (
    node.type === KEYS.p &&
    (node.listStyleType === "disc" ||
      node.listStyleType === "decimal" ||
      node.listStyleType === "todo")
  );
}

function listTag(node: Node): "ul" | "ol" {
  return node.listStyleType === "decimal" ? "ol" : "ul";
}

function renderList(
  items: readonly Node[],
  index: number,
  indent: number,
): { html: string; next: number } {
  const first = items[index];
  if (first === undefined) {
    return { html: "", next: index };
  }

  const tag = listTag(first);
  const todo = first.listStyleType === "todo";
  const start =
    tag === "ol" && typeof first.listStart === "number"
      ? attr("start", String(first.listStart))
      : "";
  const parts: string[] = [];
  let cursor = index;
  while (cursor < items.length) {
    const item = items[cursor];
    if (
      item === undefined ||
      !isListItem(item) ||
      listTag(item) !== tag ||
      item.listStyleType !== first.listStyleType
    ) {
      break;
    }

    const itemIndent = typeof item.indent === "number" ? item.indent : 1;
    if (itemIndent < indent) {
      break;
    }

    if (itemIndent > indent) {
      break;
    }

    cursor += 1;
    const nested: string[] = [];
    while (cursor < items.length) {
      const next = items[cursor];
      if (next === undefined || !isListItem(next)) {
        break;
      }

      const nextIndent = typeof next.indent === "number" ? next.indent : 1;
      if (nextIndent <= indent) {
        break;
      }

      const child = renderList(items, cursor, nextIndent);
      nested.push(child.html);
      cursor = child.next;
    }

    const value =
      tag === "ol" && typeof item.listStart === "number"
        ? attr("value", String(item.listStart))
        : "";
    const checked =
      todo && (item.checked === true || item.checked === false)
        ? attr("data-checked", item.checked ? "true" : "false")
        : "";
    const restart =
      typeof item.listRestart === "number"
        ? attr("data-nle-list-restart", String(item.listRestart))
        : "";
    const polite =
      typeof item.listRestartPolite === "number"
        ? attr("data-nle-list-restart-polite", String(item.listRestartPolite))
        : "";
    const inlines = renderInlines(childrenOf(item), false);
    const nestedHtml = nested.join("\n");
    const inner =
      nestedHtml.length === 0
        ? inlines
        : `${inlines}\n${nestedHtml
            .split("\n")
            .map((line) => `  ${line}`)
            .join("\n")}`;
    parts.push(
      `<li${idAttr(item)}${value}${checked}${restart}${polite}${blockStyle(item)}>${inner}</li>`,
    );
  }

  const todoAttr = todo ? attr("data-type", "todo") : "";
  const body = parts
    .map((part) =>
      part
        .split("\n")
        .map((line) => `  ${line}`)
        .join("\n"),
    )
    .join("\n");
  return {
    html: `<${tag}${todoAttr}${start}>\n${body}\n</${tag}>`,
    next: cursor,
  };
}

function renderBlocks(nodes: readonly Node[], root: readonly Node[]): string {
  const parts: string[] = [];
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    if (node === undefined) {
      continue;
    }

    if (isListItem(node)) {
      const indent = typeof node.indent === "number" ? node.indent : 1;
      const list = renderList(nodes, index, indent);
      parts.push(list.html);
      index = list.next - 1;
      continue;
    }

    parts.push(renderBlock(node, root));
  }

  return parts.join("\n");
}

function renderBlock(node: Node, root: readonly Node[]): string {
  const type = node.type;
  if (type === KEYS.h1 || type === KEYS.h2 || type === KEYS.h3) {
    const anchor =
      typeof node.id === "string" && node.id.length > 0 ? attr("id", headingAnchorId(node.id)) : "";
    return `<${type}${anchor}${idAttr(node)}${blockStyle(node)}>${renderInlines(childrenOf(node), false)}</${type}>`;
  }

  if (type === KEYS.p) {
    return `<p${idAttr(node)}${blockStyle(node)}>${renderInlines(childrenOf(node), false)}</p>`;
  }

  if (type === KEYS.blockquote) {
    return `<blockquote${idAttr(node)}>${renderBlocks(childrenOf(node), root)}</blockquote>`;
  }

  if (type === KEYS.hr) {
    return `<hr${idAttr(node)}>`;
  }

  if (type === KEYS.callout) {
    const icon = typeof node.icon === "string" ? attr("data-icon", node.icon) : "";
    const tone = typeof node.variant === "string" ? attr("data-tone", node.variant) : "";
    return `<aside data-nle-callout${idAttr(node)}${icon}${tone}>${renderBlocks(childrenOf(node), root)}</aside>`;
  }

  if (type === KEYS.toggle) {
    const [summary, ...rest] = childrenOf(node);
    const summaryNode = summary ?? { type: KEYS.p, children: [{ text: "" }] };
    const heading =
      summaryNode.type === KEYS.h1 || summaryNode.type === KEYS.h2 || summaryNode.type === KEYS.h3
        ? attr("data-nle-heading", summaryNode.type)
        : "";
    const anchor =
      heading.length > 0 && typeof summaryNode.id === "string"
        ? attr("id", headingAnchorId(summaryNode.id))
        : "";
    return `<details${idAttr(node)}><summary${anchor}${idAttr(summaryNode)}${heading}${blockStyle(summaryNode)}>${renderInlines(childrenOf(summaryNode), false)}</summary>${renderBlocks(rest, root)}</details>`;
  }

  if (type === KEYS.codeBlock) {
    const lang = typeof node.lang === "string" ? attr("class", `language-${node.lang}`) : "";
    const code = childrenOf(node)
      .map((line) => `<span data-nle-line${idAttr(line)}>${escapeText(plainText(line))}</span>`)
      .join("\n");
    return `<pre${idAttr(node)}><code${lang}>${code}</code></pre>`;
  }

  if (type === KEYS.table) {
    return renderTable(node);
  }

  if (type === KEYS.columnGroup) {
    const columns = childrenOf(node)
      .map((column) => {
        const width = typeof column.width === "string" ? attr("data-width", column.width) : "";
        return `<div${idAttr(column)}${width}>${renderBlocks(childrenOf(column), root)}</div>`;
      })
      .join("");
    return `<div data-nle-columns${idAttr(node)}>${columns}</div>`;
  }

  if (type === BOOKMARK_KEY) {
    const url = typeof node.url === "string" ? sanitizeLinkUrl(node.url) : undefined;
    const title =
      typeof node.title === "string" && node.title.length > 0 ? node.title : (url ?? "");
    const extras = [
      typeof node.title === "string" ? attr("data-title", node.title) : "",
      typeof node.description === "string" ? attr("data-description", node.description) : "",
      typeof node.siteName === "string" ? attr("data-site", node.siteName) : "",
      typeof node.imageUrl === "string" ? attr("data-image", node.imageUrl) : "",
      typeof node.fetchedAt === "string" ? attr("data-fetched-at", node.fetchedAt) : "",
    ].join("");
    if (url === undefined) {
      return `<p>${escapeText(title)}</p>`;
    }

    return `<a data-nle-bookmark${idAttr(node)}${attr("href", url)}${extras}>${escapeText(title)}</a>`;
  }

  if (type === KEYS.equation) {
    const tex = typeof node.texExpression === "string" ? node.texExpression : "";
    return `<div data-nle-equation${idAttr(node)}>${escapeText(tex)}</div>`;
  }

  if (type === KEYS.toc) {
    const depth =
      node.maxDepth === 1 || node.maxDepth === 2 || node.maxDepth === 3 ? node.maxDepth : undefined;
    const depthAttr = depth === undefined ? "" : attr("data-max-depth", String(depth));
    const entries = tocEntriesFromValue(root as unknown as EditorValue, depth ?? 3);
    const items = entries
      .map(
        (entry) =>
          `<li><a${attr("href", `#${headingAnchorId(entry.id)}`)}>${escapeText(entry.title)}</a></li>`,
      )
      .join("");
    return `<nav data-nle-toc${idAttr(node)}${depthAttr}><ul>${items}</ul></nav>`;
  }

  if (type === SYNCED_REF_KEY) {
    const targetId = typeof node.targetBlockId === "string" ? node.targetBlockId : "";
    const target = findNode(root, targetId);
    const inner = target === undefined ? "" : renderBlock(target, root);
    return `<div data-nle-synced-ref${idAttr(node)}${attr("data-target", targetId)}>${inner}</div>`;
  }

  return `<p>${escapeText(plainText(node))}</p>`;
}

function renderTable(node: Node): string {
  const rows = childrenOf(node);
  const widths = Array.isArray(node.colSizes) ? node.colSizes : [];
  const cols = widths.map((width) => {
    if (typeof width !== "number") {
      return "<col>";
    }

    return `<col style="width: ${String(width)}px">`;
  });
  const colgroup =
    cols.length > 0 ? `<colgroup>\n${cols.map((col) => `  ${col}`).join("\n")}\n</colgroup>` : "";
  const headerRows: string[] = [];
  const bodyRows: string[] = [];
  for (const row of rows) {
    const cells = childrenOf(row);
    const header = cells.length > 0 && cells.every((cell) => cell.type === KEYS.th);
    const html = `<tr${idAttr(row)}>\n${cells
      .map((cell) => `  ${renderCell(cell)}`)
      .join("\n")}\n</tr>`;
    if (header && bodyRows.length === 0) {
      headerRows.push(html);
    } else {
      bodyRows.push(html);
    }
  }

  const indentBlock = (html: string): string =>
    html
      .split("\n")
      .map((line) => `  ${line}`)
      .join("\n");
  const thead =
    headerRows.length > 0 ? `<thead>\n${headerRows.map(indentBlock).join("\n")}\n</thead>` : "";
  const tbody =
    bodyRows.length > 0 ? `<tbody>\n${bodyRows.map(indentBlock).join("\n")}\n</tbody>` : "";
  const sections = [colgroup, thead, tbody].filter((section) => section.length > 0);
  return `<table${idAttr(node)}>\n${sections.map(indentBlock).join("\n")}\n</table>`;
}

function renderCell(cell: Node): string {
  const tag = cell.type === KEYS.th ? "th" : "td";
  const span = [
    typeof cell.colSpan === "number" && cell.colSpan > 1
      ? attr("colspan", String(cell.colSpan))
      : "",
    typeof cell.rowSpan === "number" && cell.rowSpan > 1
      ? attr("rowspan", String(cell.rowSpan))
      : "",
  ].join("");
  return `<${tag}${idAttr(cell)}${span}>${renderBlocks(childrenOf(cell), [])}</${tag}>`;
}

function noteUnsafeLinks(
  nodes: readonly Node[],
  warnings: ReturnType<typeof createWarnings>,
): void {
  for (const node of nodes) {
    if (
      (node.type === KEYS.link || node.type === "a") &&
      typeof node.url === "string" &&
      sanitizeLinkUrl(node.url) === undefined
    ) {
      warnings.add(
        "unsafe-link",
        (count) =>
          `${count} ${plural(count, "link was", "links were")} removed because the URL is not safe. The text was kept.`,
      );
    }

    noteUnsafeLinks(childrenOf(node), warnings);
  }
}

export function exportHtmlDocument(value: EditorValue, options?: IoExportOptions): IoExportResult {
  const warnings = createWarnings();
  const nodes = nodesOf(value);
  noteUnsafeLinks(nodes, warnings);
  const title = options?.title?.trim() || firstHeading(nodes) || "Untitled";
  const body = renderBlocks(nodes, nodes);
  const content = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeText(title)}</title>
</head>
<body>
${body}
</body>
</html>
`;
  return {
    content,
    mimeType: "text/html",
    extension: "html",
    warnings: warnings.list(),
  };
}

export { COLOR_CSS, FONT_CSS };
