import { KEYS } from "platejs";

import { createEditorDocument } from "../document/editor-document";
import { parseEditorDocument } from "../document/editor-document-validate";
import { BOOKMARK_KEY } from "../features/editor-bookmark-url";
import { sanitizeLinkUrl } from "../features/editor-link-url";
import { codeLangFromToken, SYNCED_REF_KEY } from "../document/editor-document-schema";
import {
  MEDIA_NOT_SUPPORTED,
  PASTE_BLOCK_LIMIT,
  PASTE_TEXT_CHAR_LIMIT,
  pasteTooLargeMessage,
} from "../paste/editor-paste";
import type { EditorValue } from "../document/editor-value";
import { assignFreshIds } from "./fresh-ids";
import { mergeInlineText } from "./inline-text";
import {
  createWarnings,
  plural,
  type IoExportOptions,
  type IoExportResult,
  type IoImportResult,
} from "./io-types";

type Node = Record<string, unknown> & { type?: string; children?: Node[]; text?: string };

type MarkedToken = {
  type: string;
  text?: string;
  raw?: string;
  depth?: number;
  tokens?: MarkedToken[];
  items?: MarkedToken[];
  href?: string;
  lang?: string;
  ordered?: boolean;
  start?: number | "";
  task?: boolean;
  checked?: boolean;
  header?: { text?: string; tokens?: MarkedToken[] }[];
  rows?: { text?: string; tokens?: MarkedToken[] }[][];
  loose?: boolean;
};

const ALERTS: Record<string, string> = {
  NOTE: "info",
  TIP: "success",
  IMPORTANT: "info",
  WARNING: "warning",
  CAUTION: "danger",
};

const TONE_ALERT: Record<string, string> = {
  info: "NOTE",
  success: "TIP",
  warning: "WARNING",
  danger: "CAUTION",
};

function isRecord(value: unknown): value is Node {
  return typeof value === "object" && value !== null;
}

function nodesOf(value: EditorValue): Node[] {
  return value as unknown as Node[];
}

function childrenOf(node: Node): Node[] {
  return Array.isArray(node.children) ? node.children.filter(isRecord) : [];
}

function plain(node: Node): string {
  if (typeof node.text === "string") {
    return node.text;
  }

  if (node.type === KEYS.mention && typeof node.label === "string") {
    return `@${node.label}`;
  }

  return childrenOf(node)
    .map((child) => plain(child))
    .join("");
}

function escapeMd(text: string, inTable: boolean): string {
  return text
    .split("\n")
    .map((line) => {
      let escaped = line
        .replaceAll("\\", "\\\\")
        .replaceAll(/([*`_~[\]$])/g, "\\$1")
        .replaceAll("<", "\\<");
      if (inTable) {
        escaped = escaped.replaceAll("|", "\\|");
      }

      return escaped
        .replace(/^(#{1,6})(?=\s)/, "\\$1")
        .replace(/^(\d+)\.(\s)/, "$1\\.$2")
        .replace(/^([-+])(\s)/, "\\$1$2");
    })
    .join("\n");
}

function renderInlines(
  nodes: readonly Node[],
  warnings: ReturnType<typeof createWarnings>,
  inTable: boolean,
): string {
  let text = "";
  nodes.forEach((node, index) => {
    text += renderInline(node, warnings, inTable, nodes[index + 1], text);
  });
  return text;
}

function wrapMark(text: string, marker: string): string {
  const leading = /^\s*/.exec(text)?.[0] ?? "";
  const trailing = /\s*$/.exec(text)?.[0] ?? "";
  const core = text.slice(leading.length, text.length - trailing.length || undefined);
  if (core.length === 0) {
    return text;
  }

  return `${leading}${marker}${core}${marker}${trailing}`;
}

function renderInline(
  node: Node,
  warnings: ReturnType<typeof createWarnings>,
  inTable: boolean,
  following?: Node,
  preceding = "",
): string {
  if (typeof node.text === "string") {
    const pieces = node.text.split("\n").map((piece) => escapeMd(piece, inTable));
    let text = pieces.join("\\\n");
    if (node.code === true) {
      text = `\`${text.replaceAll("`", "\\`")}\``;
    } else {
      if (node.strikethrough === true) text = wrapMark(text, "~~");
      if (node.italic === true) text = wrapMark(text, "*");
      if (node.bold === true) text = wrapMark(text, "**");
    }

    if (node.underline === true) {
      warnings.add(
        "underline",
        (count) =>
          `${count} ${plural(count, "underline was", "underlines were")} removed. Markdown has no underline.`,
      );
    }
    if (node.subscript === true) {
      warnings.add(
        "subscript",
        (count) =>
          `${count} ${plural(count, "subscript was", "subscripts were")} removed. Markdown has no subscript.`,
      );
    }
    if (node.superscript === true) {
      warnings.add(
        "superscript",
        (count) =>
          `${count} ${plural(count, "superscript was", "superscripts were")} removed. Markdown has no superscript.`,
      );
    }
    if (typeof node.color === "string") {
      warnings.add(
        "text-color",
        (count) =>
          `${count} text ${plural(count, "colour was", "colours were")} removed. Markdown has no text colour.`,
      );
    }
    if (typeof node.backgroundColor === "string") {
      warnings.add(
        "highlight",
        (count) =>
          `${count} ${plural(count, "highlight was", "highlights were")} removed. Markdown has no highlight.`,
      );
    }
    if (typeof node.fontSize === "string") {
      warnings.add(
        "font-size",
        (count) =>
          `${count} font ${plural(count, "size was", "sizes were")} removed. Markdown has no font size.`,
      );
    }
    if (typeof node.fontFamily === "string") {
      warnings.add(
        "font-family",
        (count) =>
          `${count} font ${plural(count, "family was", "families were")} removed. Markdown has no font family.`,
      );
    }
    return text;
  }

  if (node.type === KEYS.inlineEquation) {
    // TeX ignores whitespace, and a newline or tab cannot sit inside a Markdown line.
    const tex = (typeof node.texExpression === "string" ? node.texExpression : "")
      .replace(/[\n\r\t]/g, " ")
      .trim();
    // "$$" would read back as a block equation, so an empty one cannot be written.
    if (tex.length === 0) {
      warnings.add(
        "empty-equation",
        (count) =>
          `${count} empty inline ${plural(count, "equation was", "equations were")} removed. Markdown has no empty inline math.`,
      );
      return "";
    }
    if (!readsBackAsInlineMath(tex, inTable, following, preceding)) {
      warnings.add(
        "inline-equation-text",
        (count) =>
          `${count} inline ${plural(count, "equation was", "equations were")} written as plain text. Markdown cannot mark them as math here.`,
      );
      return escapeMd(`$${tex}$`, inTable);
    }
    return `$${tex}$`;
  }

  if (node.type === KEYS.mention) {
    warnings.add(
      "mention-link",
      (count) =>
        `${count} ${plural(count, "mention lost its link", "mentions lost their links")}. Markdown keeps the name as text.`,
    );
    const label = typeof node.label === "string" ? node.label : "";
    return `@${escapeMd(label, inTable)}`;
  }

  if (node.type === KEYS.link || node.type === "a") {
    const url = typeof node.url === "string" ? node.url : "";
    const safe = sanitizeLinkUrl(url);
    const inner = renderInlines(childrenOf(node), warnings, inTable);
    if (safe === undefined) {
      warnings.add(
        "unsafe-link",
        (count) =>
          `${count} ${plural(count, "link was", "links were")} removed because the URL is not safe. The text was kept.`,
      );
      return inner;
    }

    return `[${inner}](${safe})`;
  }

  return renderInlines(childrenOf(node), warnings, inTable);
}

function blockStyles(node: Node, warnings: ReturnType<typeof createWarnings>): void {
  if (typeof node.align === "string") {
    warnings.add(
      "alignment",
      (count) =>
        `${count} ${plural(count, "alignment was", "alignments were")} removed. Markdown has no alignment.`,
    );
  }
  if (typeof node.lineHeight === "number") {
    warnings.add(
      "line-height",
      (count) =>
        `${count} line ${plural(count, "height was", "heights were")} removed. Markdown has no line height.`,
    );
  }
  if (typeof node.indent === "number" && typeof node.listStyleType !== "string") {
    warnings.add(
      "block-indent",
      (count) =>
        `${count} ${plural(count, "indent was", "indents were")} removed. Markdown only indents lists.`,
    );
  }
}

function isListItem(node: Node): boolean {
  return node.type === KEYS.p && typeof node.listStyleType === "string";
}

function renderBlocks(
  nodes: readonly Node[],
  warnings: ReturnType<typeof createWarnings>,
  root: readonly Node[],
): string[] {
  const parts: string[] = [];
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    if (node === undefined) {
      continue;
    }

    if (isListItem(node)) {
      const indent = typeof node.indent === "number" ? node.indent : 1;
      const list = renderList(nodes, index, indent, warnings);
      // A blank line does not end a CommonMark list. A comment does, so a
      // following list keeps its own style and start number.
      if (parts.length > 0 && parts[parts.length - 1] !== "<!-- -->") {
        const previous = parts[parts.length - 1] ?? "";
        if (/^(?:[-*] |\d+\. |- \[[ x]\] )/m.test(previous)) {
          parts.push("<!-- -->");
        }
      }
      parts.push(list.markdown);
      index = list.next - 1;
      continue;
    }

    const rendered = renderBlock(node, warnings, root);
    if (rendered !== undefined) {
      parts.push(rendered);
    }
  }

  return parts;
}

function contentColumn(style: string, marker: string): number {
  if (style === "decimal") {
    return marker.length + 1;
  }

  return 2;
}

function renderList(
  nodes: readonly Node[],
  index: number,
  indent: number,
  warnings: ReturnType<typeof createWarnings>,
  pad = "",
): { markdown: string; next: number } {
  const lines: string[] = [];
  let cursor = index;
  let number = 1;
  const first = nodes[index];
  const style = first?.listStyleType;
  while (cursor < nodes.length) {
    const item = nodes[cursor];
    if (item === undefined || !isListItem(item)) {
      break;
    }

    const itemIndent = typeof item.indent === "number" ? item.indent : 1;
    if (itemIndent < indent) {
      break;
    }

    if (itemIndent > indent) {
      break;
    }

    if (item.listStyleType !== style) {
      break;
    }

    if (
      item.listStyleType !== "disc" &&
      item.listStyleType !== "decimal" &&
      item.listStyleType !== "todo"
    ) {
      warnings.add(
        "list-style",
        (count) =>
          `${count} list ${plural(count, "style was", "styles were")} removed. Markdown keeps bullets, numbers, and to-dos.`,
      );
    }

    let marker = "-";
    if (item.listStyleType === "todo") {
      marker = item.checked === true ? "- [x]" : "- [ ]";
    } else if (item.listStyleType === "decimal") {
      const explicit = typeof item.listStart === "number" ? item.listStart : number;
      if (lines.length > 0 && explicit !== number) {
        break;
      }

      number = explicit;
      marker = `${String(number)}.`;
      number += 1;
    }

    if (typeof item.listRestart === "number" || typeof item.listRestartPolite === "number") {
      warnings.add(
        "list-restart",
        (count) =>
          `${count} list ${plural(count, "restart was", "restarts were")} removed. Markdown keeps the start number only.`,
      );
    }

    blockStyles(item, warnings);
    cursor += 1;
    const nested: string[] = [];
    const childPad = `${pad}${" ".repeat(contentColumn(String(item.listStyleType), marker))}`;
    while (cursor < nodes.length) {
      const next = nodes[cursor];
      if (next === undefined || !isListItem(next)) {
        break;
      }

      const nextIndent = typeof next.indent === "number" ? next.indent : 1;
      if (nextIndent <= indent) {
        break;
      }

      const child = renderList(nodes, cursor, nextIndent, warnings, childPad);
      nested.push(child.markdown);
      cursor = child.next;
    }

    const text = renderInlines(childrenOf(item), warnings, false);
    lines.push(`${pad}${marker} ${text}`);
    if (nested.length > 0) {
      lines.push(nested.join("\n"));
    }
  }

  return { markdown: lines.join("\n"), next: cursor };
}

function findNode(nodes: readonly Node[], id: string): Node | undefined {
  for (const node of nodes) {
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

function renderBlock(
  node: Node,
  warnings: ReturnType<typeof createWarnings>,
  root: readonly Node[],
): string | undefined {
  blockStyles(node, warnings);
  const type = node.type;
  if (type === KEYS.h1 || type === KEYS.h2 || type === KEYS.h3) {
    const level = type === KEYS.h1 ? "#" : type === KEYS.h2 ? "##" : "###";
    return `${level} ${renderInlines(childrenOf(node), warnings, false)}`;
  }

  if (type === KEYS.p) {
    return renderInlines(childrenOf(node), warnings, false);
  }

  if (type === KEYS.blockquote) {
    const inner = renderBlocks(childrenOf(node), warnings, root);
    return inner
      .map((part) =>
        part
          .split("\n")
          .map((line) => `> ${line}`)
          .join("\n"),
      )
      .join("\n>\n");
  }

  if (type === KEYS.hr) {
    return "---";
  }

  if (type === KEYS.codeBlock) {
    const lang = typeof node.lang === "string" ? node.lang : "";
    const code = childrenOf(node)
      .map((line) => plain(line))
      .join("\n");
    const fence = code.includes("```") ? "````" : "```";
    return `${fence}${lang}\n${code}\n${fence}`;
  }

  if (type === KEYS.equation) {
    const tex = typeof node.texExpression === "string" ? node.texExpression : "";
    return `$$\n${tex}\n$$`;
  }

  if (type === KEYS.callout) {
    const tone = typeof node.variant === "string" ? node.variant : "info";
    const alert = TONE_ALERT[tone];
    if (alert === undefined) {
      warnings.add(
        "callout-tone",
        (count) =>
          `${count} callout ${plural(count, "tone was", "tones were")} saved as a note. Markdown has no matching alert.`,
      );
    }
    if (typeof node.icon === "string") {
      warnings.add(
        "callout-icon",
        (count) =>
          `${count} callout ${plural(count, "icon was", "icons were")} removed. Markdown alerts have no custom icon.`,
      );
    }
    const kind = alert ?? "NOTE";
    const inner = renderBlocks(childrenOf(node), warnings, root);
    const lines = [
      `> [!${kind}]`,
      ...inner.flatMap((part) => part.split("\n").map((line) => `> ${line}`)),
    ];
    return lines.join("\n");
  }

  if (type === KEYS.toggle) {
    const [summary, ...rest] = childrenOf(node);
    const summaryText =
      summary === undefined ? "" : renderInlines(childrenOf(summary), warnings, false);
    const headingLevel =
      summary?.type === KEYS.h1
        ? 1
        : summary?.type === KEYS.h2
          ? 2
          : summary?.type === KEYS.h3
            ? 3
            : 0;
    // A heading summary is a Markdown heading on its own line inside <summary>,
    // so import can restore a toggle heading of the same level.
    const summaryMarkdown =
      headingLevel === 0 ? summaryText : `\n\n${"#".repeat(headingLevel)} ${summaryText}\n`;
    const body = renderBlocks(rest, warnings, root).join("\n\n");
    return `<details>\n<summary>${summaryMarkdown}</summary>\n\n${body}\n\n</details>`;
  }

  if (type === KEYS.columnGroup) {
    warnings.add(
      "columns-layout",
      (count) =>
        `${count} column ${plural(count, "layout was", "layouts were")} removed. Markdown writes the columns one after another.`,
    );
    return childrenOf(node)
      .map((column) => renderBlocks(childrenOf(column), warnings, root).join("\n\n"))
      .join("\n\n");
  }

  if (type === BOOKMARK_KEY) {
    const url = typeof node.url === "string" ? (sanitizeLinkUrl(node.url) ?? "") : "";
    const title = typeof node.title === "string" && node.title.length > 0 ? node.title : url;
    if (
      typeof node.description === "string" ||
      typeof node.imageUrl === "string" ||
      typeof node.siteName === "string"
    ) {
      warnings.add(
        "bookmark-details",
        (count) =>
          `${count} bookmark ${plural(count, "detail was", "details were")} removed. Markdown keeps the title and link.`,
      );
    }
    return `[${escapeMd(title, false)}](${url})`;
  }

  if (type === KEYS.mention) {
    return renderInline(node, warnings, false);
  }

  if (type === KEYS.toc) {
    warnings.add(
      "toc-omitted",
      () => "The table of contents was left out. Markdown viewers build their own.",
    );
    return undefined;
  }

  if (type === SYNCED_REF_KEY) {
    warnings.add(
      "synced-unlinked",
      (count) =>
        `${count} synced ${plural(count, "reference was", "references were")} written out in full. Markdown has no live link between the copies.`,
    );
    const targetId = typeof node.targetBlockId === "string" ? node.targetBlockId : "";
    const target = findNode(root, targetId);
    if (target === undefined) {
      return "";
    }

    return renderBlock(target, warnings, root) ?? "";
  }

  if (type === KEYS.table) {
    return renderTable(node, warnings);
  }

  warnings.add(
    "unsupported-block",
    (count) =>
      `${count} ${plural(count, "block was", "blocks were")} kept as text. Markdown has no matching block.`,
  );
  const text = plain(node);
  return text.length > 0 ? text : undefined;
}

function cellText(cell: Node, warnings: ReturnType<typeof createWarnings>): string {
  const blocks = childrenOf(cell);
  if (
    typeof cell.backgroundColor === "string" ||
    blocks.some((block) => typeof block.align === "string")
  ) {
    warnings.add(
      "table-cell-style",
      (count) =>
        `${count} table cell ${plural(count, "style was", "styles were")} removed. Markdown tables have no cell background or alignment.`,
    );
  }
  if (blocks.length > 1) {
    warnings.add(
      "table-blocks",
      (count) =>
        `${count} table ${plural(count, "cell was", "cells were")} joined with a line break. Markdown puts one paragraph in a cell.`,
    );
  }
  return blocks.map((block) => renderInlines(childrenOf(block), warnings, true)).join("<br>");
}

function renderTable(node: Node, warnings: ReturnType<typeof createWarnings>): string {
  if (Array.isArray(node.colSizes) && node.colSizes.some((width) => typeof width === "number")) {
    warnings.add(
      "table-widths",
      (count) =>
        `${count} table ${plural(count, "width was", "widths were")} removed. Markdown tables have no column widths.`,
    );
  }

  const rows = childrenOf(node);
  const grid: string[][] = [];
  rows.forEach((row, rowIndex) => {
    const line = grid[rowIndex] ?? [];
    grid[rowIndex] = line;
    let column = 0;
    for (const cell of childrenOf(row)) {
      while (line[column] !== undefined) {
        column += 1;
      }

      const text = cellText(cell, warnings);
      const colSpan = typeof cell.colSpan === "number" && cell.colSpan > 1 ? cell.colSpan : 1;
      const rowSpan = typeof cell.rowSpan === "number" && cell.rowSpan > 1 ? cell.rowSpan : 1;
      if (colSpan > 1 || rowSpan > 1) {
        warnings.add(
          "table-merge",
          (count) =>
            `${count} merged table ${plural(count, "cell was", "cells were")} split. The text stays in the first cell.`,
        );
      }

      for (let rowOffset = 0; rowOffset < rowSpan; rowOffset += 1) {
        const target = grid[rowIndex + rowOffset] ?? [];
        grid[rowIndex + rowOffset] = target;
        for (let columnOffset = 0; columnOffset < colSpan; columnOffset += 1) {
          target[column + columnOffset] =
            rowOffset === 0 && columnOffset === 0 ? text : (target[column + columnOffset] ?? "");
        }
      }

      column += colSpan;
    }
  });

  if (grid.length === 0) {
    return "";
  }

  const width = Math.max(...grid.map((row) => row.length));
  const normalized = grid.map((row) =>
    Array.from({ length: width }, (_, index) => row[index] ?? ""),
  );
  const header = normalized[0] ?? [];
  const body = normalized.slice(1);
  const divider = header.map(() => "---");
  const format = (row: string[]): string => `| ${row.join(" | ")} |`;
  return [format(header), format(divider), ...body.map((row) => format(row))].join("\n");
}

export function exportMarkdownDocument(
  value: EditorValue,
  _options?: IoExportOptions,
): IoExportResult {
  const warnings = createWarnings();
  const nodes = nodesOf(value);
  const content = `${renderBlocks(nodes, warnings, nodes).join("\n\n")}\n`;
  return {
    content,
    mimeType: "text/markdown",
    extension: "md",
    warnings: warnings.list(),
  };
}

function paragraph(children: Node[], extra?: Node): Node {
  return { type: KEYS.p, children: children.length > 0 ? children : [{ text: "" }], ...extra };
}

function inlineTokens(
  tokens: readonly MarkedToken[] | undefined,
  warnings: ReturnType<typeof createWarnings>,
  nonce: string,
): Node[] {
  if (tokens === undefined) {
    return [{ text: "" }];
  }

  const nodes: Node[] = [];
  for (const token of tokens) {
    if (token.type === "br") {
      nodes.push({ text: "\n" });
      continue;
    }

    if (token.type === "escape") {
      nodes.push({ text: token.text ?? "" });
      continue;
    }

    if (token.type === "text" || token.type === "paragraph") {
      if (token.tokens !== undefined && token.tokens.length > 0) {
        nodes.push(...inlineTokens(token.tokens, warnings, nonce));
      } else {
        nodes.push({ text: token.text ?? "" });
      }
      continue;
    }

    if (
      token.type === "strong" ||
      token.type === "em" ||
      token.type === "del" ||
      token.type === "codespan"
    ) {
      const children =
        token.type === "codespan"
          ? [{ text: token.text ?? "" }]
          : inlineTokens(token.tokens, warnings, nonce);
      const mark =
        token.type === "strong"
          ? "bold"
          : token.type === "em"
            ? "italic"
            : token.type === "del"
              ? "strikethrough"
              : "code";
      for (const child of children) {
        if (typeof child.text === "string") {
          nodes.push({ ...child, [mark]: true });
        } else {
          nodes.push(child);
        }
      }
      continue;
    }

    if (token.type === "link") {
      const href = token.href ?? "";
      const safe = sanitizeLinkUrl(href);
      const inner = inlineTokens(token.tokens, warnings, nonce);
      if (safe === undefined) {
        warnings.add(
          "unsafe-link",
          (count) =>
            `${count} ${plural(count, "link was", "links were")} removed because the URL is not safe. The text was kept.`,
        );
        nodes.push(...inner);
      } else {
        nodes.push({ type: KEYS.link, url: safe, children: inner });
      }
      continue;
    }

    if (token.type === "image") {
      warnings.add("media-dropped", () => MEDIA_NOT_SUPPORTED);
      const alt = token.text ?? "";
      if (alt.length > 0) {
        nodes.push({ text: alt });
      }
      continue;
    }

    if (token.type === "html") {
      const raw = restoreInlineMath(token.text ?? token.raw ?? "", nonce);
      if (/^<br\s*\/?>$/i.test(raw.trim())) {
        nodes.push({ text: "\n" });
        continue;
      }

      warnings.add(
        "raw-html",
        (count) =>
          `${count} raw HTML ${plural(count, "snippet was", "snippets were")} kept as text. Markdown import keeps details, summary, and line breaks as structure.`,
      );
      nodes.push({ text: raw.replace(/<script[\s\S]*?<\/script>/gi, "") });
      continue;
    }

    warnings.add(
      "markdown-extension",
      (count) =>
        `${count} Markdown ${plural(count, "extension was", "extensions were")} kept as text.`,
    );
    nodes.push({ text: token.raw ?? token.text ?? "" });
  }

  return nodes.length > 0 ? mergeInlineText(nodes) : [{ text: "" }];
}

function listFrom(
  token: MarkedToken,
  indent: number,
  warnings: ReturnType<typeof createWarnings>,
  nonce: string,
): Node[] {
  const blocks: Node[] = [];
  const items = token.items ?? [];
  items.forEach((item, itemIndex) => {
    if (indent > 6) {
      warnings.add(
        "list-depth",
        (count) =>
          `${count} ${plural(count, "list item was", "list items were")} kept at the deepest indent. This editor stores six levels.`,
      );
    }

    const storedIndent = Math.min(indent, 6);
    const extra: Node = { indent: storedIndent };
    if (item.task === true) {
      extra.listStyleType = "todo";
      extra.checked = item.checked === true;
    } else if (token.ordered === true) {
      extra.listStyleType = "decimal";
      const start = typeof token.start === "number" ? token.start : 1;
      if (start !== 1) {
        extra.listStart = start + itemIndex;
      }
    } else {
      extra.listStyleType = "disc";
    }

    const inline: Node[] = [];
    const nested: Node[] = [];
    for (const child of item.tokens ?? []) {
      if (child.type === "list") {
        nested.push(...listFrom(child, storedIndent + 1, warnings, nonce));
        continue;
      }

      if (child.type === "text" || child.type === "paragraph") {
        inline.push(...inlineTokens(child.tokens ?? [child], warnings, nonce));
        continue;
      }

      nested.push(...blocksFromToken(child, warnings, nonce));
    }

    blocks.push(paragraph(inline, extra), ...nested);
  });

  return blocks;
}

function blocksFromToken(
  token: MarkedToken,
  warnings: ReturnType<typeof createWarnings>,
  nonce: string,
): Node[] {
  if (token.type === "space") {
    return [];
  }

  if (token.type === "heading") {
    const depth = token.depth ?? 1;
    const type = depth <= 1 ? KEYS.h1 : depth === 2 ? KEYS.h2 : KEYS.h3;
    if (depth > 3) {
      warnings.add(
        "heading-depth",
        (count) =>
          `${count} ${plural(count, "heading was", "headings were")} saved as heading 3. This editor stores headings 1 to 3.`,
      );
    }
    return [{ type, children: inlineTokens(token.tokens, warnings, nonce) }];
  }

  if (token.type === "paragraph") {
    return [paragraph(inlineTokens(token.tokens, warnings, nonce))];
  }

  if (token.type === "list") {
    return listFrom(token, 1, warnings, nonce);
  }

  if (token.type === "blockquote") {
    const inner = (token.tokens ?? []).flatMap((child) => blocksFromToken(child, warnings, nonce));
    const alert = alertCallout(inner, warnings);
    if (alert !== undefined) {
      return [alert];
    }

    const paragraphs = inner.map((node) =>
      node.type === KEYS.p ? node : paragraph([{ text: plain(node) }]),
    );
    return [
      {
        type: KEYS.blockquote,
        children: paragraphs.length > 0 ? paragraphs : [{ type: KEYS.p, children: [{ text: "" }] }],
      },
    ];
  }

  if (token.type === "code") {
    const lines = (token.text ?? "").split("\n");
    const node: Node = {
      type: KEYS.codeBlock,
      children: lines.map((line) => ({ type: KEYS.codeLine, children: [{ text: line }] })),
    };
    const lang =
      typeof token.lang === "string" && token.lang.length > 0
        ? codeLangFromToken(token.lang)
        : null;
    if (lang !== null) {
      node.lang = lang;
    } else if (typeof token.lang === "string" && token.lang.length > 0) {
      warnings.add(
        "code-language",
        (count) =>
          `${count} code ${plural(count, "language was", "languages were")} removed. The language is not one this editor stores.`,
      );
    }
    return [node];
  }

  if (token.type === "hr" || token.type === "thematicBreak") {
    return [{ type: KEYS.hr, children: [{ text: "" }] }];
  }

  if (token.type === "table") {
    const header = token.header ?? [];
    const rows = [header, ...(token.rows ?? [])];
    return [
      {
        type: KEYS.table,
        children: rows.map((row, rowIndex) => ({
          type: KEYS.tr,
          children: row.map((cell) => ({
            type: rowIndex === 0 ? KEYS.th : KEYS.td,
            children: [paragraph(inlineTokens(cell.tokens, warnings, nonce))],
          })),
        })),
      },
    ];
  }

  if (token.type === "html") {
    const raw = (token.text ?? token.raw ?? "").trim();
    if (raw === "<!-- -->" || raw === "<!---->") {
      return [];
    }

    return htmlTokenBlocks(restoreInlineMath(raw, nonce), warnings);
  }

  if (token.type === "footnote" || token.raw?.includes("[^")) {
    warnings.add(
      "footnote",
      (count) =>
        `${count} ${plural(count, "footnote was", "footnotes were")} kept as text. This editor has no footnotes.`,
    );
    return [paragraph([{ text: token.raw ?? token.text ?? "" }])];
  }

  warnings.add(
    "markdown-extension",
    (count) =>
      `${count} Markdown ${plural(count, "extension was", "extensions were")} kept as text.`,
  );
  const raw = token.raw ?? token.text ?? "";
  return raw.trim().length > 0 ? [paragraph([{ text: raw.trim() }])] : [];
}

function alertCallout(
  nodes: readonly Node[],
  warnings: ReturnType<typeof createWarnings>,
): Node | undefined {
  const first = nodes[0];
  if (first === undefined || first.type !== KEYS.p) {
    return undefined;
  }

  const text = plain(first);
  const match = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\n?/.exec(text);
  if (match?.[1] === undefined) {
    return undefined;
  }

  const tone = ALERTS[match[1]] ?? "info";
  if (match[1] === "IMPORTANT") {
    warnings.add(
      "callout-tone",
      (count) =>
        `${count} callout ${plural(count, "tone was", "tones were")} saved as a note. Markdown's important alert has no separate tone here.`,
    );
  }

  const rest = text.slice(match[0].length);
  const children: Node[] = [];
  if (rest.length > 0) {
    children.push(paragraph([{ text: rest }]));
  }

  for (const node of nodes.slice(1)) {
    children.push(node.type === KEYS.p ? node : paragraph([{ text: plain(node) }]));
  }

  if (children.length === 0) {
    children.push(paragraph([{ text: "" }]));
  }

  return { type: KEYS.callout, variant: tone, children };
}

function htmlTokenBlocks(raw: string, warnings: ReturnType<typeof createWarnings>): Node[] {
  const trimmed = raw.trim();
  if (/^<br\s*\/?>$/i.test(trimmed)) {
    return [paragraph([{ text: "\n" }])];
  }

  const details = /^<details>\s*<summary>([\s\S]*?)<\/summary>\s*([\s\S]*?)<\/details>$/i.exec(
    trimmed,
  );
  if (details !== null) {
    return [
      {
        type: KEYS.toggle,
        children: [
          paragraph([{ text: details[1]?.trim() ?? "" }]),
          ...(details[2]?.trim() ? [paragraph([{ text: details[2].trim() }])] : []),
        ],
      },
    ];
  }

  const withoutScript = trimmed.replace(/<script[\s\S]*?<\/script>/gi, (match) => {
    warnings.add(
      "raw-html",
      (count) =>
        `${count} raw HTML ${plural(count, "snippet was", "snippets were")} kept as text. Markdown import keeps details, summary, and line breaks as structure.`,
    );
    return match.replace(/<[^>]+>/g, "");
  });
  if (withoutScript !== trimmed) {
    return withoutScript.trim().length > 0 ? [paragraph([{ text: withoutScript.trim() }])] : [];
  }

  warnings.add(
    "raw-html",
    (count) =>
      `${count} raw HTML ${plural(count, "snippet was", "snippets were")} kept as text. Markdown import keeps details, summary, and line breaks as structure.`,
  );
  return [paragraph([{ text: trimmed }])];
}

async function tokensOf(source: string): Promise<MarkedToken[]> {
  const markdown = await import("@platejs/markdown");
  const tokens: unknown = markdown.parseMarkdownBlocks(source, { exclude: [], trim: false });
  return Array.isArray(tokens) ? (tokens as MarkedToken[]) : [];
}

function limitBlocks(blocks: Node[], warnings: ReturnType<typeof createWarnings>): Node[] {
  let next = blocks;
  if (next.length > PASTE_BLOCK_LIMIT) {
    next = next.slice(0, PASTE_BLOCK_LIMIT);
    warnings.add("block-limit", () => pasteTooLargeMessage("blocks"));
  }

  const countText = (nodes: readonly Node[]): number => {
    let count = 0;
    for (const node of nodes) {
      if (typeof node.text === "string") {
        count += node.text.length;
      }
      if (node.children !== undefined) {
        count += countText(node.children);
      }
    }
    return count;
  };

  if (countText(next) > PASTE_TEXT_CHAR_LIMIT) {
    warnings.add("text-limit", () => pasteTooLargeMessage("characters"));
  }

  return next;
}

const TOGGLE_CAP = 3;

function readBalancedDetails(
  source: string,
  start: number,
): { summary: string; body: string; end: number } | null {
  const lower = source.toLowerCase();
  if (lower.slice(start, start + 9) !== "<details>") {
    return null;
  }

  let cursor = start + 9;
  while (cursor < source.length && /\s/.test(source[cursor] ?? "")) {
    cursor += 1;
  }

  if (lower.slice(cursor, cursor + 9) !== "<summary>") {
    return null;
  }

  const summaryStart = cursor + 9;
  const summaryEnd = lower.indexOf("</summary>", summaryStart);
  if (summaryEnd === -1) {
    return null;
  }

  cursor = summaryEnd + "</summary>".length;
  let depth = 1;
  while (cursor < source.length && depth > 0) {
    const nextOpen = lower.indexOf("<details>", cursor);
    const nextClose = lower.indexOf("</details>", cursor);
    if (nextClose === -1) {
      return null;
    }

    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth += 1;
      cursor = nextOpen + "<details>".length;
      continue;
    }

    depth -= 1;
    if (depth === 0) {
      return {
        summary: source.slice(summaryStart, summaryEnd),
        body: source.slice(summaryEnd + "</summary>".length, nextClose),
        end: nextClose + "</details>".length,
      };
    }

    cursor = nextClose + "</details>".length;
  }

  return null;
}

function liftDetails(source: string): {
  text: string;
  details: { summary: string; body: string }[];
} {
  const details: { summary: string; body: string }[] = [];
  let text = "";
  let index = 0;
  while (index < source.length) {
    const detailsAt = source.toLowerCase().indexOf("<details>", index);
    const fenceMatch = /(?:^|\n)(```+|~~~+)/.exec(source.slice(index));
    const fenceAt =
      fenceMatch?.[1] === undefined
        ? -1
        : index + fenceMatch.index + (fenceMatch[0].startsWith("\n") ? 1 : 0);
    if (fenceAt !== -1 && (detailsAt === -1 || fenceAt < detailsAt)) {
      const marker = fenceMatch?.[1] ?? "";
      const close = source.indexOf(`\n${marker}`, fenceAt + marker.length);
      const end = close === -1 ? source.length : close + marker.length + 1;
      text += source.slice(index, end);
      index = end;
      continue;
    }

    if (detailsAt === -1) {
      text += source.slice(index);
      break;
    }

    const block = readBalancedDetails(source, detailsAt);
    if (block === null) {
      text += source.slice(index);
      break;
    }

    text += source.slice(index, detailsAt);
    details.push({ summary: block.summary, body: block.body });
    text += `\n\n%%NLE_DETAILS_${String(details.length - 1)}%%\n\n`;
    index = block.end;
  }

  return { text, details };
}

function paragraphFromNode(node: Node): Node {
  if (node.type === KEYS.p) {
    return node;
  }

  return paragraph([{ text: plain(node) }]);
}

// Inline math is read by a small scanner, not one regex, so a backslash escapes
// the next character (a `$` after an odd run of backslashes is not a delimiter).
// Code spans and fences are copied through untouched, so `$` inside them stays text.
// An equation opens at an unescaped `$` followed by a non-space, and closes at the
// next unescaped `$` on the same line when that one follows a non-space and is not
// followed by a digit. Anything else is text.
const NONCE_CHARACTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

// The nonce is random per call, so document text cannot forge a placeholder.
function newInlineMathNonce(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
    NONCE_CHARACTERS.charAt(byte % NONCE_CHARACTERS.length),
  ).join("");
}

function inlineMathPlaceholderPattern(nonce: string): RegExp {
  return new RegExp(`%%NLEIEQ${nonce}([0-9a-f]+)%%`, "g");
}

// The TeX is hex in the placeholder so marked never reads its punctuation.
function encodeInlineMath(tex: string): string {
  let hex = "";
  for (let index = 0; index < tex.length; index += 1) {
    hex += tex.charCodeAt(index).toString(16).padStart(4, "0");
  }
  return hex;
}

function decodeInlineMath(hex: string): string {
  let tex = "";
  for (let index = 0; index < hex.length; index += 4) {
    tex += String.fromCharCode(Number.parseInt(hex.slice(index, index + 4), 16));
  }
  return tex;
}

function restoreInlineMath(text: string, nonce: string): string {
  return text.replace(
    inlineMathPlaceholderPattern(nonce),
    (_match, hex: string) => `$${decodeInlineMath(hex)}$`,
  );
}

// Whether a `$` in this source ends the equation early (an escaped `$` does not).
function hasUnescapedDollar(text: string): boolean {
  for (let index = 0; index < text.length;) {
    if (text.charAt(index) === "\\") {
      index += 2;
    } else if (text.charAt(index) === "$") {
      return true;
    } else {
      index += 1;
    }
  }
  return false;
}

function endsWithOddBackslashes(text: string): boolean {
  const run = /\\+$/.exec(text)?.[0].length ?? 0;
  return run % 2 === 1;
}

// The export check: would `$tex$` read back as this same equation in this place?
function readsBackAsInlineMath(
  tex: string,
  inTable: boolean,
  following: Node | undefined,
  preceding: string,
): boolean {
  if (hasUnescapedDollar(tex) || endsWithOddBackslashes(tex)) {
    return false;
  }
  // A raw `|` would split the table cell.
  if (inTable && tex.includes("|")) {
    return false;
  }
  // An odd backslash run before the opener would escape it.
  if (endsWithOddBackslashes(preceding)) {
    return false;
  }
  return following === undefined || !/^\d/.test(plain(following));
}

// Index of the closing `$` for an opener whose content starts at `from`, or -1.
function inlineMathClose(source: string, from: number): number {
  let index = from;
  while (index < source.length && source.charAt(index) !== "\n") {
    const char = source.charAt(index);
    if (char === "\\") {
      index += 2;
    } else if (char === "$") {
      const before = source.charAt(index - 1);
      const after = source.charAt(index + 1);
      const valid = index > from && !/\s/.test(before) && !/\d/.test(after);
      return valid ? index : -1;
    } else {
      index += 1;
    }
  }
  return -1;
}

// Index just past the closing backtick run of the same length, or -1.
function codeSpanEnd(source: string, from: number, length: number): number {
  const run = "`".repeat(length);
  let at = source.indexOf(run, from);
  while (at !== -1) {
    if (source.charAt(at - 1) !== "`" && source.charAt(at + length) !== "`") {
      return at + length;
    }
    at = source.indexOf(run, at + 1);
  }
  return -1;
}

// Index just past a fence that opens at `start`. An unclosed fence runs to the end.
function fenceEnd(source: string, start: number): number {
  const marker = /^(`{3,}|~{3,})/.exec(source.slice(start, start + 200))?.[1] ?? "```";
  let lineEnd = source.indexOf("\n", start);
  while (lineEnd !== -1) {
    const nextEnd = source.indexOf("\n", lineEnd + 1);
    const line = source.slice(lineEnd + 1, nextEnd === -1 ? undefined : nextEnd).trim();
    if (line.length >= marker.length && line.split("").every((char) => char === marker.charAt(0))) {
      return nextEnd === -1 ? source.length : nextEnd;
    }
    lineEnd = nextEnd;
  }
  return source.length;
}

function liftInlineMath(source: string, nonce: string): string {
  let out = "";
  let index = 0;
  while (index < source.length) {
    const char = source.charAt(index);
    const atLineStart = index === 0 || source.charAt(index - 1) === "\n";
    if (char === "\\") {
      out += source.slice(index, index + 2);
      index += 2;
    } else if (
      atLineStart &&
      (source.startsWith("```", index) || source.startsWith("~~~", index))
    ) {
      const end = fenceEnd(source, index);
      out += source.slice(index, end);
      index = end;
    } else if (char === "`") {
      const run = /^`+/.exec(source.slice(index, index + 200))?.[0] ?? "`";
      const end = codeSpanEnd(source, index + run.length, run.length);
      if (end === -1) {
        out += run;
        index += run.length;
      } else {
        out += source.slice(index, end);
        index = end;
      }
    } else if (char === "$" && !/\s|\$/.test(source.charAt(index + 1))) {
      const close = inlineMathClose(source, index + 1);
      if (close === -1) {
        out += char;
        index += 1;
      } else {
        out += `%%NLEIEQ${nonce}${encodeInlineMath(source.slice(index + 1, close))}%%`;
        index = close + 1;
      }
    } else {
      out += char;
      index += 1;
    }
  }
  return out;
}

function splitInlineMath(node: Node, nonce: string): Node {
  if (!Array.isArray(node.children)) {
    return node;
  }

  const children: Node[] = [];
  for (const child of node.children) {
    if (typeof child.text === "string" && child.text.includes(`%%NLEIEQ${nonce}`)) {
      const text = child.text;
      let last = 0;
      for (const match of text.matchAll(inlineMathPlaceholderPattern(nonce))) {
        const start = match.index;
        if (start > last) {
          children.push({ ...child, text: text.slice(last, start) });
        }
        children.push({
          type: KEYS.inlineEquation,
          texExpression: decodeInlineMath(match[1] ?? ""),
          children: [{ text: "" }],
        });
        last = start + match[0].length;
      }
      if (last < text.length) {
        children.push({ ...child, text: text.slice(last) });
      }
      continue;
    }

    children.push(splitInlineMath(child, nonce));
  }

  return { ...node, children };
}

async function markdownBlocks(
  source: string,
  warnings: ReturnType<typeof createWarnings>,
  depth: number,
): Promise<Node[]> {
  const lifted = liftDetails(source);
  const equations: string[] = [];
  const withEquations = lifted.text.replace(/\$\$\n?([\s\S]*?)\n?\$\$/g, (_match, tex: string) => {
    const index = equations.length;
    equations.push(tex);
    return `\n\n%%NLE_EQUATION_${String(index)}%%\n\n`;
  });
  const nonce = newInlineMathNonce();
  const tokens = await tokensOf(liftInlineMath(withEquations, nonce));
  const blocks: Node[] = [];
  for (const token of tokens) {
    const text = token.raw ?? token.text ?? "";
    const detail = /%%NLE_DETAILS_(\d+)%%/.exec(text);
    if (detail?.[1] !== undefined) {
      const stored = lifted.details[Number(detail[1])];
      if (stored !== undefined) {
        blocks.push(...(await toggleBlocks(stored, warnings, depth)));
        continue;
      }
    }

    const equation = /%%NLE_EQUATION_(\d+)%%/.exec(text);
    if (equation?.[1] !== undefined) {
      blocks.push({
        type: KEYS.equation,
        texExpression: equations[Number(equation[1])] ?? "",
        children: [{ text: "" }],
      });
      continue;
    }

    blocks.push(...blocksFromToken(token, warnings, nonce));
  }

  return blocks.map((block) => splitInlineMath(block, nonce));
}

async function toggleBlocks(
  stored: { summary: string; body: string },
  warnings: ReturnType<typeof createWarnings>,
  depth: number,
): Promise<Node[]> {
  const summaryBlocks = await markdownBlocks(stored.summary.trim(), warnings, depth);
  const body = await markdownBlocks(stored.body, warnings, depth + 1);
  const summaryNode = summaryBlocks[0] ?? paragraph([{ text: "" }]);
  const summaryRest = summaryBlocks.slice(1);
  if (depth > TOGGLE_CAP) {
    warnings.add(
      "toggle-depth",
      (count) =>
        `${count} nested ${plural(count, "toggle was", "toggles were")} folded into the third level. This editor stores three toggle levels.`,
    );
    return [paragraphFromNode(summaryNode), ...summaryRest.map(paragraphFromNode), ...body];
  }

  return [
    {
      type: KEYS.toggle,
      children: [summaryNode, ...summaryRest, ...body],
    },
  ];
}

export async function importMarkdownDocument(input: string): Promise<IoImportResult> {
  const warnings = createWarnings();
  try {
    const stripped = input.replace(/<script[\s\S]*?<\/script>/gi, (match) => {
      warnings.add(
        "raw-html",
        (count) =>
          `${count} raw HTML ${plural(count, "snippet was", "snippets were")} kept as text. Markdown import keeps details, summary, and line breaks as structure.`,
      );
      return match.replace(/<[^>]+>/g, "");
    });
    const blocks = await markdownBlocks(stripped, warnings, 1);
    const limited = limitBlocks(blocks, warnings);
    const parsed = parseEditorDocument(createEditorDocument("document", limited as EditorValue));
    if (parsed.status !== "ok") {
      const messages =
        parsed.status === "future-version"
          ? ["This file was made by a newer version of the editor."]
          : parsed.issues.map((issue) => issue.message);
      return {
        ok: false,
        error: messages.slice(0, 3).join(" ") || "This Markdown is not an editor document.",
      };
    }

    return { ok: true, value: assignFreshIds(parsed.document.content), warnings: warnings.list() };
  } catch {
    return { ok: false, error: "This Markdown could not be read." };
  }
}
