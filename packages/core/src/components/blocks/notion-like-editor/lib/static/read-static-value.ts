import { createEditorDocument } from "../document/editor-document";
import { migrateEditorDocument } from "../document/editor-document-migrate";
import {
  EDITOR_ELEMENT_RULES,
  isAllowedElementAttrValue,
} from "../document/editor-document-schema";
import { isMediaBlockType } from "../features/editor-media-source";
import { sanitizeLinkUrl } from "../features/editor-link-url";
import { parseEditorDocument } from "../document/editor-document-validate";
import type { EditorValue } from "../document/editor-value";

const KNOWN_TYPES = new Set<string>(EDITOR_ELEMENT_RULES.map((rule) => rule.type));

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function plainText(value: unknown): string {
  if (!isRecord(value)) {
    return "";
  }
  if (typeof value.text === "string" && !("children" in value)) {
    return value.text;
  }
  if (!Array.isArray(value.children)) {
    return "";
  }
  return value.children.map((child) => plainText(child)).join("");
}

// An unknown type still shows its text. Known nodes keep their children.
function softenNode(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value)) {
    return null;
  }
  if (typeof value.text === "string" && !("type" in value)) {
    return value;
  }
  const type = typeof value.type === "string" ? value.type : "";
  const children = Array.isArray(value.children)
    ? value.children.map((child) => softenNode(child) ?? { text: "" })
    : [{ text: plainText(value) }];
  if (type.length === 0 || !KNOWN_TYPES.has(type)) {
    return {
      type: "p",
      id: typeof value.id === "string" ? value.id : undefined,
      children: [{ text: plainText(value) }],
    };
  }
  const next: Record<string, unknown> = { ...value, children };
  for (const key of Object.keys(next)) {
    if (key === "type" || key === "children") continue;
    if (
      key === "url" &&
      typeof next.url === "string" &&
      sanitizeLinkUrl(next.url) === undefined &&
      type !== "bookmark" &&
      !isMediaBlockType(type)
    ) {
      delete next.url;
    }
    if (
      !isAllowedElementAttrValue(
        type as Parameters<typeof isAllowedElementAttrValue>[0],
        key,
        next[key],
      ) &&
      key !== "url" &&
      key !== "texExpression" &&
      key !== "targetBlockId" &&
      key !== "width" &&
      key !== "colSizes"
    ) {
      delete next[key];
    }
  }
  return next;
}

function soften(content: EditorValue): EditorValue {
  return content.map(
    (node) => softenNode(node) ?? { type: "p", children: [{ text: "" }] },
  ) as EditorValue;
}

/**
 * The editor loads through migrateEditorDocument then parseEditorDocument.
 * A future version, a non-document, or a value that cannot be read renders nothing.
 * Unsupported nodes stay visible as paragraphs instead of throwing.
 */
export function readStaticValue(value: unknown): EditorValue | null {
  try {
    if (!Array.isArray(value)) {
      return null;
    }
    const migrated = migrateEditorDocument(
      createEditorDocument("static", value as EditorValue),
      "static",
    );
    const parsed = parseEditorDocument(migrated);
    if (parsed.status === "ok") {
      return soften(parsed.document.content);
    }
    if (parsed.status === "unsupported") {
      return soften(value as EditorValue);
    }
    return null;
  } catch {
    return null;
  }
}
