import { KEYS } from "platejs";

import { createEditorDocument } from "../document/editor-document";
import { parseEditorDocument } from "../document/editor-document-validate";
import { BOOKMARK_KEY } from "../features/editor-bookmark-url";
import { MENTION_ENTITY_TYPE } from "../features/editor-mention-node";
import { SYNCED_REF_KEY, isStoredEquationExpression } from "../document/editor-document-schema";
import {
  MEDIA_NOT_SUPPORTED,
  PASTE_BLOCK_LIMIT,
  PASTE_HTML_CHAR_LIMIT,
  PASTE_TEXT_CHAR_LIMIT,
  clearPasteCaptureState,
  pasteTooLargeMessage,
  sanitizePastedFragment,
} from "../paste/editor-paste";
import { clearUnsafePastedLinkRepairs, unsafePastedLinkRepairs } from "../features/editor-link-url";
import type { EditorValue } from "../document/editor-value";
import { assignFreshIds } from "./fresh-ids";
import { pasteHtmlAsDocument } from "./html-paste";
import { mergeInlineText } from "./inline-text";
import { COLOR_CSS, FONT_CSS } from "./html-export";
import { createWarnings, plural, type IoImportResult, type IoWarning } from "./io-types";

type SlateNode = Record<string, unknown>;

const SKIP_TAGS = new Set([
  "SCRIPT",
  "STYLE",
  "IFRAME",
  "OBJECT",
  "EMBED",
  "LINK",
  "META",
  "NOSCRIPT",
  "SVG",
  "HEAD",
  "TITLE",
]);

function isElement(value: unknown): value is Element {
  return (
    typeof value === "object" &&
    value !== null &&
    "nodeType" in value &&
    value.nodeType === 1 &&
    "tagName" in value
  );
}

function elementChildren(element: Element): Element[] {
  return Array.from(element.children).filter((child) => isElement(child));
}

function styleDeclarations(element: Element): Map<string, string> {
  const style = element.getAttribute("style") ?? "";
  const map = new Map<string, string>();
  for (const part of style.split(";")) {
    const splitAt = part.indexOf(":");
    if (splitAt === -1) {
      continue;
    }

    const name = part.slice(0, splitAt).trim().toLowerCase();
    const value = part
      .slice(splitAt + 1)
      .trim()
      .toLowerCase();
    if (name.length > 0 && value.length > 0) {
      map.set(name, value);
    }
  }

  return map;
}

function tokenFromColor(css: string | undefined): string | undefined {
  if (css === undefined) {
    return undefined;
  }

  const normalized = css.replaceAll(" ", "").toLowerCase();
  for (const [token, hex] of Object.entries(COLOR_CSS)) {
    if (hex === normalized) {
      return token;
    }
  }

  return undefined;
}

function familyFromCss(css: string | undefined): string | undefined {
  if (css === undefined) {
    return undefined;
  }

  for (const [token, value] of Object.entries(FONT_CSS)) {
    if (value === css) {
      return token;
    }
  }

  return undefined;
}

function applySpanStyle(
  element: Element,
  text: SlateNode,
  warnings: ReturnType<typeof createWarnings>,
): void {
  const style = styleDeclarations(element);
  const allowed = new Set(["color", "background-color", "font-size", "font-family"]);
  for (const name of style.keys()) {
    if (!allowed.has(name)) {
      warnings.add(
        "dropped-style",
        (count) =>
          `${count} ${plural(count, "style was", "styles were")} removed. Only colour, highlight, font size, and font family are kept.`,
      );
    }
  }

  const color = tokenFromColor(style.get("color"));
  if (style.has("color")) {
    if (color === undefined) {
      warnings.add(
        "text-color",
        (count) =>
          `${count} text ${plural(count, "colour was", "colours were")} removed. The colour is not one this editor stores.`,
      );
    } else {
      text.color = color;
    }
  }

  const highlight = tokenFromColor(style.get("background-color"));
  if (style.has("background-color")) {
    if (highlight === undefined) {
      warnings.add(
        "highlight",
        (count) =>
          `${count} ${plural(count, "highlight was", "highlights were")} removed. The colour is not one this editor stores.`,
      );
    } else {
      text.backgroundColor = highlight;
    }
  }

  const size = style.get("font-size");
  if (size !== undefined) {
    if (
      size === "12px" ||
      size === "14px" ||
      size === "16px" ||
      size === "18px" ||
      size === "24px" ||
      size === "32px"
    ) {
      text.fontSize = size;
    } else {
      warnings.add(
        "font-size",
        (count) =>
          `${count} font ${plural(count, "size was", "sizes were")} removed. The size is not one this editor stores.`,
      );
    }
  }

  const family = familyFromCss(style.get("font-family"));
  if (style.has("font-family")) {
    if (family === undefined) {
      warnings.add(
        "font-family",
        (count) =>
          `${count} font ${plural(count, "family was", "families were")} removed. The family is not one this editor stores.`,
      );
    } else {
      text.fontFamily = family;
    }
  }
}

function applyBlockStyle(
  element: Element,
  node: SlateNode,
  warnings: ReturnType<typeof createWarnings>,
): void {
  const style = styleDeclarations(element);
  const align = style.get("text-align");
  if (align === "left" || align === "center" || align === "right" || align === "justify") {
    node.align = align;
  } else if (align !== undefined) {
    warnings.add(
      "alignment",
      (count) =>
        `${count} ${plural(count, "alignment was", "alignments were")} removed. The alignment is not one this editor stores.`,
    );
  }

  const lineHeight = style.get("line-height");
  if (lineHeight !== undefined) {
    const parsed = Number(lineHeight);
    if (parsed === 1 || parsed === 1.25 || parsed === 1.5 || parsed === 1.75 || parsed === 2) {
      node.lineHeight = parsed;
    } else {
      warnings.add(
        "line-height",
        (count) =>
          `${count} line ${plural(count, "height was", "heights were")} removed. The line height is not one this editor stores.`,
      );
    }
  }
}

function stamp(element: Element, node: SlateNode): SlateNode {
  const id = element.getAttribute("data-nle-id");
  if (id !== null && id.length > 0) {
    node.id = id;
  }

  return node;
}

function textNode(text: string, marks?: SlateNode): SlateNode {
  return { text, ...marks };
}

function paragraph(children: SlateNode[], extra?: SlateNode): SlateNode {
  return { type: KEYS.p, children: children.length > 0 ? children : [{ text: "" }], ...extra };
}

function inlineFrom(
  element: Element,
  warnings: ReturnType<typeof createWarnings>,
  marks: SlateNode,
): SlateNode[] {
  if (element.tagName === "BR") {
    return [textNode("\n", marks)];
  }

  if (element.tagName === "IMG") {
    warnings.add("media-dropped", () => MEDIA_NOT_SUPPORTED);
    const alt = element.getAttribute("alt") ?? "";
    return alt.length > 0 ? [textNode(alt, marks)] : [];
  }

  if (element.hasAttribute("data-nle-mention")) {
    const id = element.getAttribute("data-id") ?? "";
    const label = (element.textContent ?? "").replace(/^@/, "");
    return [
      stamp(element, {
        type: KEYS.mention,
        entityType: MENTION_ENTITY_TYPE,
        entityId: id,
        label,
        children: [{ text: "" }],
      }),
    ];
  }

  if (element.hasAttribute("data-nle-inline-equation")) {
    // Only the text is read. Attributes such as onclick are never copied.
    const tex = element.textContent ?? "";
    if (!isStoredEquationExpression(tex)) {
      return [textNode(tex, marks)];
    }

    return [
      stamp(element, {
        type: KEYS.inlineEquation,
        texExpression: tex,
        children: [{ text: "" }],
      }),
    ];
  }

  if (element.tagName === "A" && !element.hasAttribute("data-nle-bookmark")) {
    const href = element.getAttribute("href") ?? "";
    return [
      stamp(element, {
        type: KEYS.link,
        url: href,
        children: inlinesFrom(element, warnings, marks),
      }),
    ];
  }

  const nextMarks = { ...marks };
  if (element.tagName === "STRONG" || element.tagName === "B") nextMarks.bold = true;
  if (element.tagName === "EM" || element.tagName === "I") nextMarks.italic = true;
  if (element.tagName === "U") nextMarks.underline = true;
  if (element.tagName === "S" || element.tagName === "DEL" || element.tagName === "STRIKE") {
    nextMarks.strikethrough = true;
  }
  if (element.tagName === "CODE" && element.parentElement?.tagName !== "PRE") nextMarks.code = true;
  if (element.tagName === "SUB") nextMarks.subscript = true;
  if (element.tagName === "SUP") nextMarks.superscript = true;
  if (element.tagName === "SPAN") {
    applySpanStyle(element, nextMarks, warnings);
  }

  return inlinesFrom(element, warnings, nextMarks);
}

function inlinesFrom(
  element: Element,
  warnings: ReturnType<typeof createWarnings>,
  marks: SlateNode,
): SlateNode[] {
  const nodes: SlateNode[] = [];
  for (const child of Array.from(element.childNodes)) {
    if (child.nodeType === 3) {
      const text = child.textContent ?? "";
      if (text.length > 0) {
        nodes.push(textNode(text, marks));
      }
      continue;
    }

    if (!isElement(child) || SKIP_TAGS.has(child.tagName)) {
      continue;
    }

    nodes.push(...inlineFrom(child, warnings, marks));
  }

  return nodes.length > 0 ? mergeInlineText(nodes) : [{ text: "" }];
}

function listItems(
  list: Element,
  indent: number,
  warnings: ReturnType<typeof createWarnings>,
): SlateNode[] {
  const todo = list.getAttribute("data-type") === "todo";
  const ordered = list.tagName === "OL";
  const startRaw = list.getAttribute("start");
  const start = startRaw !== null && /^[0-9]+$/.test(startRaw) ? Number(startRaw) : undefined;
  const blocks: SlateNode[] = [];
  let offset = 0;
  for (const item of elementChildren(list)) {
    if (item.tagName !== "LI") {
      blocks.push(...blocksFromElement(item, warnings));
      continue;
    }

    const style = todo ? "todo" : ordered ? "decimal" : "disc";
    const extra: SlateNode = {
      indent,
      listStyleType: style,
    };
    const value = item.getAttribute("value");
    if (ordered && value !== null && /^[0-9]+$/.test(value)) {
      extra.listStart = Number(value);
    } else if (ordered && start !== undefined) {
      extra.listStart = start + offset;
    }
    if (todo) {
      extra.checked = item.getAttribute("data-checked") === "true";
    }
    const restart = item.getAttribute("data-nle-list-restart");
    if (restart !== null && /^[0-9]+$/.test(restart)) {
      extra.listRestart = Number(restart);
    }
    const polite = item.getAttribute("data-nle-list-restart-polite");
    if (polite !== null && /^[0-9]+$/.test(polite)) {
      extra.listRestartPolite = Number(polite);
    }

    const inlineChildren: SlateNode[] = [];
    const nested: SlateNode[] = [];
    for (const child of Array.from(item.childNodes)) {
      if (child.nodeType === 3) {
        const text = (child.textContent ?? "").replace(/\n[ \t]*/g, "");
        if (text.length > 0) {
          inlineChildren.push({ text });
        }
        continue;
      }

      if (!isElement(child) || SKIP_TAGS.has(child.tagName)) {
        continue;
      }

      if (child.tagName === "UL" || child.tagName === "OL") {
        nested.push(...listItems(child, indent + 1, warnings));
        continue;
      }

      if (isBlockTag(child)) {
        nested.push(...blocksFromElement(child, warnings));
        continue;
      }

      inlineChildren.push(...inlineFrom(child, warnings, {}));
    }

    const itemNode = stamp(item, paragraph(inlineChildren, extra));
    applyBlockStyle(item, itemNode, warnings);
    blocks.push(itemNode, ...nested);
    offset += 1;
  }

  return blocks;
}

function isBlockTag(element: Element): boolean {
  return (
    element.hasAttribute("data-nle-callout") ||
    element.hasAttribute("data-nle-columns") ||
    element.hasAttribute("data-nle-bookmark") ||
    element.hasAttribute("data-nle-equation") ||
    element.hasAttribute("data-nle-toc") ||
    element.hasAttribute("data-nle-synced-ref") ||
    [
      "P",
      "H1",
      "H2",
      "H3",
      "H4",
      "H5",
      "H6",
      "UL",
      "OL",
      "BLOCKQUOTE",
      "HR",
      "PRE",
      "TABLE",
      "DETAILS",
      "DIV",
      "ASIDE",
      "NAV",
    ].includes(element.tagName)
  );
}

function blocksFromElement(
  element: Element,
  warnings: ReturnType<typeof createWarnings>,
): SlateNode[] {
  if (SKIP_TAGS.has(element.tagName)) {
    return [];
  }

  if (
    element.hasAttribute("data-nle-bookmark") ||
    (element.tagName === "A" && element.hasAttribute("data-nle-bookmark"))
  ) {
    const href = element.getAttribute("href") ?? "";
    const node: SlateNode = stamp(element, {
      type: BOOKMARK_KEY,
      url: href,
      children: [{ text: "" }],
    });
    const title = element.getAttribute("data-title");
    if (title !== null && title.trim().length > 0) node.title = title.trim();
    const description = element.getAttribute("data-description");
    if (description !== null) node.description = description;
    const site = element.getAttribute("data-site");
    if (site !== null) node.siteName = site;
    const image = element.getAttribute("data-image");
    if (image !== null) node.imageUrl = image;
    const fetched = element.getAttribute("data-fetched-at");
    if (fetched !== null) node.fetchedAt = fetched;
    return [node];
  }

  if (element.hasAttribute("data-nle-equation")) {
    return [
      stamp(element, {
        type: KEYS.equation,
        texExpression: element.textContent ?? "",
        children: [{ text: "" }],
      }),
    ];
  }

  if (element.hasAttribute("data-nle-toc")) {
    const depth = Number(element.getAttribute("data-max-depth"));
    const node: SlateNode = stamp(element, { type: KEYS.toc, children: [{ text: "" }] });
    if (depth === 1 || depth === 2 || depth === 3) {
      node.maxDepth = depth;
    }
    return [node];
  }

  if (element.hasAttribute("data-nle-synced-ref")) {
    return [
      stamp(element, {
        type: SYNCED_REF_KEY,
        targetBlockId: element.getAttribute("data-target") ?? "",
        children: [{ text: "" }],
      }),
    ];
  }

  if (element.hasAttribute("data-nle-callout")) {
    const node: SlateNode = stamp(element, {
      type: KEYS.callout,
      children: blocksFromChildren(element, warnings),
    });
    const icon = element.getAttribute("data-icon");
    if (icon !== null) node.icon = icon;
    const tone = element.getAttribute("data-tone");
    if (tone !== null) node.variant = tone;
    if (!Array.isArray(node.children) || node.children.length === 0) {
      node.children = [{ type: KEYS.p, children: [{ text: "" }] }];
    }
    return [node];
  }

  if (element.hasAttribute("data-nle-columns")) {
    const columns = elementChildren(element).map((column) => {
      const child: SlateNode = stamp(column, {
        type: KEYS.column,
        children: blocksFromChildren(column, warnings),
      });
      const width = column.getAttribute("data-width");
      if (width !== null) child.width = width;
      if (!Array.isArray(child.children) || child.children.length === 0) {
        child.children = [{ type: KEYS.p, children: [{ text: "" }] }];
      }
      return child;
    });
    return [stamp(element, { type: KEYS.columnGroup, children: columns })];
  }

  if (element.tagName === "DETAILS") {
    const summary = elementChildren(element).find((child) => child.tagName === "SUMMARY");
    const heading = summary?.getAttribute("data-nle-heading");
    const summaryType = heading === "h1" || heading === "h2" || heading === "h3" ? heading : KEYS.p;
    const summaryNode: SlateNode = stamp(summary ?? element, {
      type: summaryType,
      children: summary === undefined ? [{ text: "" }] : inlinesFrom(summary, warnings, {}),
    });
    if (summary !== undefined) {
      applyBlockStyle(summary, summaryNode, warnings);
    }
    const body = elementChildren(element)
      .filter((child) => child.tagName !== "SUMMARY")
      .flatMap((child) => blocksFromElement(child, warnings));
    return [stamp(element, { type: KEYS.toggle, children: [summaryNode, ...body] })];
  }

  if (element.tagName === "UL" || element.tagName === "OL") {
    return listItems(element, 1, warnings);
  }

  if (element.tagName === "TABLE") {
    return [stamp(element, tableFrom(element, warnings))];
  }

  if (element.tagName === "PRE") {
    const code = elementChildren(element).find((child) => child.tagName === "CODE") ?? element;
    const className = code.getAttribute("class") ?? "";
    const match = /language-([a-z0-9+-]+)/i.exec(className);
    const lineElements = Array.from(code.querySelectorAll("[data-nle-line]"));
    const lines =
      lineElements.length > 0
        ? lineElements.map((line) => ({
            text: line.textContent ?? "",
            id: line.getAttribute("data-nle-id") ?? undefined,
          }))
        : (code.textContent ?? "")
            .replace(/\n$/, "")
            .split("\n")
            .map((text) => ({ text, id: undefined }));
    const node: SlateNode = stamp(element, {
      type: KEYS.codeBlock,
      children: lines.map((line) => {
        const codeLine: SlateNode = {
          type: KEYS.codeLine,
          children: [{ text: line.text }],
        };
        if (line.id !== undefined) {
          codeLine.id = line.id;
        }
        return codeLine;
      }),
    });
    if (match?.[1] !== undefined) {
      node.lang = match[1];
    }
    return [node];
  }

  if (element.tagName === "BLOCKQUOTE") {
    const children = blocksFromChildren(element, warnings).map((child) =>
      child.type === KEYS.p ? child : paragraph([{ text: textOf(child) }]),
    );
    return [
      stamp(element, {
        type: KEYS.blockquote,
        children: children.length > 0 ? children : [{ type: KEYS.p, children: [{ text: "" }] }],
      }),
    ];
  }

  if (element.tagName === "HR") {
    return [stamp(element, { type: KEYS.hr, children: [{ text: "" }] })];
  }

  if (/^H[1-6]$/.test(element.tagName)) {
    const level = Number(element.tagName.slice(1));
    const type = level <= 1 ? KEYS.h1 : level === 2 ? KEYS.h2 : KEYS.h3;
    if (level > 3) {
      warnings.add(
        "heading-depth",
        (count) =>
          `${count} ${plural(count, "heading was", "headings were")} saved as heading 3. This editor stores headings 1 to 3.`,
      );
    }
    const node = {
      type,
      children: inlinesFrom(element, warnings, {}),
    };
    applyBlockStyle(element, node, warnings);
    return [stamp(element, node)];
  }

  if (element.tagName === "P") {
    const node = stamp(element, paragraph(inlinesFrom(element, warnings, {})));
    applyBlockStyle(element, node, warnings);
    return [node];
  }

  if (element.tagName === "IMG") {
    return [
      {
        type: KEYS.img,
        alt: element.getAttribute("alt") ?? "",
        children: [{ text: "" }],
      },
    ];
  }

  const childBlocks = blocksFromChildren(element, warnings);
  if (childBlocks.length > 0) {
    if (!["DIV", "SECTION", "ARTICLE", "BODY", "MAIN"].includes(element.tagName)) {
      warnings.add(
        "unsupported-html",
        (count) =>
          `${count} unsupported ${plural(count, "element was", "elements were")} turned into paragraphs.`,
      );
    }
    return childBlocks;
  }

  const text = (element.textContent ?? "").trim();
  if (text.length === 0) {
    return [];
  }

  warnings.add(
    "unsupported-html",
    (count) =>
      `${count} unsupported ${plural(count, "element was", "elements were")} turned into paragraphs.`,
  );
  return [paragraph([{ text }])];
}

function blocksFromChildren(
  element: Element,
  warnings: ReturnType<typeof createWarnings>,
): SlateNode[] {
  const blocks: SlateNode[] = [];
  const loose: SlateNode[] = [];
  const flush = (): void => {
    if (loose.length === 0) {
      return;
    }

    blocks.push(paragraph(loose.splice(0, loose.length)));
  };

  for (const child of Array.from(element.childNodes)) {
    if (child.nodeType === 3) {
      const text = child.textContent ?? "";
      if (text.trim().length > 0) {
        loose.push({ text });
      }
      continue;
    }

    if (!isElement(child)) {
      continue;
    }

    if (
      child.hasAttribute("data-nle-bookmark") ||
      (isBlockTag(child) && child.tagName !== "A" && child.tagName !== "SPAN")
    ) {
      flush();
      blocks.push(...blocksFromElement(child, warnings));
      continue;
    }

    if (SKIP_TAGS.has(child.tagName)) {
      continue;
    }

    loose.push(...inlineFrom(child, warnings, {}));
  }

  flush();
  return blocks;
}

function textOf(node: SlateNode): string {
  if (typeof node.text === "string") {
    return node.text;
  }

  if (!Array.isArray(node.children)) {
    return "";
  }

  return node.children
    .map((child) => (typeof child === "object" && child !== null ? textOf(child as SlateNode) : ""))
    .join("");
}

function tableFrom(table: Element, warnings: ReturnType<typeof createWarnings>): SlateNode {
  const cols = Array.from(table.querySelectorAll("colgroup col"));
  const colSizes = cols.map((col) => {
    const style = col.getAttribute("style") ?? "";
    const match = /width:\s*(\d+)px/i.exec(style);
    return match?.[1] === undefined ? null : Number(match[1]);
  });
  const rows = Array.from(table.querySelectorAll("tr")).map((row) => {
    const cells = elementChildren(row)
      .filter((cell) => cell.tagName === "TD" || cell.tagName === "TH")
      .map((cell) => {
        const node: SlateNode = stamp(cell, {
          type: cell.tagName === "TH" ? KEYS.th : KEYS.td,
          children: blocksFromChildren(cell, warnings).filter((child) => child.type === KEYS.p),
        });
        if (!Array.isArray(node.children) || node.children.length === 0) {
          node.children = [{ type: KEYS.p, children: [{ text: "" }] }];
        }
        const colspan = Number(cell.getAttribute("colspan"));
        const rowspan = Number(cell.getAttribute("rowspan"));
        if (colspan > 1) node.colSpan = colspan;
        if (rowspan > 1) node.rowSpan = rowspan;
        return node;
      });
    return stamp(row, { type: KEYS.tr, children: cells });
  });
  const node: SlateNode = { type: KEYS.table, children: rows };
  if (colSizes.some((width) => typeof width === "number")) {
    node.colSizes = colSizes;
  }
  return node;
}

function countBlocks(nodes: readonly unknown[]): number {
  let count = 0;
  for (const node of nodes) {
    if (
      typeof node === "object" &&
      node !== null &&
      "type" in node &&
      node.type !== KEYS.link &&
      node.type !== KEYS.mention &&
      node.type !== KEYS.inlineEquation
    ) {
      count += 1;
    }
  }

  return count;
}

function countText(nodes: readonly unknown[]): number {
  let count = 0;
  const visit = (node: unknown): void => {
    if (typeof node !== "object" || node === null) {
      return;
    }

    if ("text" in node && typeof node.text === "string") {
      count += node.text.length;
    }

    if ("children" in node && Array.isArray(node.children)) {
      for (const child of node.children) {
        visit(child);
      }
    }
  };

  for (const node of nodes) {
    visit(node);
  }

  return count;
}

function limitValue(value: EditorValue, warnings: ReturnType<typeof createWarnings>): EditorValue {
  let next = value;
  if (countBlocks(next) > PASTE_BLOCK_LIMIT) {
    next = next.slice(0, PASTE_BLOCK_LIMIT);
    warnings.add("block-limit", () => pasteTooLargeMessage("blocks"));
  }

  if (countText(next) > PASTE_TEXT_CHAR_LIMIT) {
    warnings.add("text-limit", () => pasteTooLargeMessage("characters"));
    let left = PASTE_TEXT_CHAR_LIMIT;
    const trim = (node: SlateNode): SlateNode => {
      if (typeof node.text === "string") {
        const text = node.text.slice(0, Math.max(0, left));
        left -= text.length;
        return { ...node, text };
      }

      if (!Array.isArray(node.children)) {
        return node;
      }

      return {
        ...node,
        children: node.children.map((child) => trim(child as SlateNode)),
      };
    };
    next = next.map((node) => trim(node as unknown as SlateNode)) as EditorValue;
  }

  return next;
}

function repairsToWarnings(
  repairs: readonly { message: string }[],
  warnings: ReturnType<typeof createWarnings>,
): void {
  const generic: string[] = [];
  for (const repair of repairs) {
    if (repair.message === MEDIA_NOT_SUPPORTED) {
      warnings.add("media-dropped", () => MEDIA_NOT_SUPPORTED);
      continue;
    }

    if (repair.message.includes("unsafe URL")) {
      const detail = repair.message;
      warnings.add(
        "unsafe-link",
        (count) =>
          `${count} ${plural(count, "link was", "links were")} removed because the URL is not safe. The text was kept. ${detail}`,
      );
      continue;
    }

    if (repair.message === pasteTooLargeMessage("blocks")) {
      warnings.add("block-limit", () => pasteTooLargeMessage("blocks"));
      continue;
    }

    if (repair.message === pasteTooLargeMessage("characters")) {
      warnings.add("text-limit", () => pasteTooLargeMessage("characters"));
      continue;
    }

    generic.push(repair.message);
  }

  if (generic.length > 0) {
    const messages = generic.join(" ");
    warnings.add(
      "paste-repair",
      (count) =>
        `${count} ${plural(count, "part was", "parts were")} changed while reading HTML. ${messages}`,
    );
  }
}

function isOwnedExport(body: Element): boolean {
  return (
    body.querySelector(
      "[data-nle-id], [data-nle-callout], [data-nle-toc], [data-nle-bookmark], [data-nle-equation], [data-nle-columns], [data-nle-synced-ref], [data-nle-mention], [data-nle-inline-equation], [data-nle-line]",
    ) !== null
  );
}

function parserBody(html: string): Element | undefined {
  const parser = globalThis.DOMParser;
  if (typeof parser !== "function") {
    return undefined;
  }

  const document = new parser().parseFromString(html, "text/html");
  return document.body ?? undefined;
}

export function importHtmlDocument(input: string): IoImportResult {
  if (input.length > PASTE_HTML_CHAR_LIMIT) {
    return {
      ok: false,
      error: `This HTML is larger than ${PASTE_HTML_CHAR_LIMIT} characters.`,
    };
  }

  const body = parserBody(input);
  if (body === undefined) {
    return {
      ok: false,
      error: "This HTML needs a DOMParser. None is available in this runtime.",
    };
  }

  const warnings = createWarnings();
  clearPasteCaptureState();
  clearUnsafePastedLinkRepairs();
  let value: EditorValue;
  try {
    if (!isOwnedExport(body)) {
      const pasted = pasteHtmlAsDocument(input);
      repairsToWarnings(pasted.repairs, warnings);
      value = pasted.value;
      const parsedPaste = parseEditorDocument(createEditorDocument("document", value));
      if (parsedPaste.status !== "ok") {
        const messages =
          parsedPaste.status === "future-version"
            ? ["This file was made by a newer version of the editor."]
            : parsedPaste.issues.map((issue) => issue.message);
        return {
          ok: false,
          error: messages.slice(0, 3).join(" ") || "This HTML is not an editor document.",
        };
      }

      return {
        ok: true,
        value: assignFreshIds(parsedPaste.document.content),
        warnings: warnings.list(),
      };
    }

    const candidates = blocksFromChildren(body, warnings);
    const repairs: { path: number[]; message: string }[] = [];
    value = sanitizePastedFragment(candidates, {
      isInline: (node) =>
        node.type === KEYS.link ||
        node.type === KEYS.mention ||
        node.type === KEYS.inlineEquation ||
        node.type === "a",
      repairs,
    });
    repairsToWarnings(repairs, warnings);
    repairsToWarnings(unsafePastedLinkRepairs(), warnings);
    value = limitValue(value, warnings);
  } catch {
    clearPasteCaptureState();
    return { ok: false, error: "This HTML could not be read." };
  } finally {
    clearPasteCaptureState();
  }

  const parsed = parseEditorDocument(createEditorDocument("document", value));
  if (parsed.status !== "ok") {
    const messages =
      parsed.status === "future-version"
        ? ["This file was made by a newer version of the editor."]
        : parsed.issues.map((issue) => issue.message);
    return {
      ok: false,
      error: messages.slice(0, 3).join(" ") || "This HTML is not an editor document.",
    };
  }

  return {
    ok: true,
    value: assignFreshIds(parsed.document.content),
    warnings: warnings.list(),
  };
}

export type { IoWarning };
