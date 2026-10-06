import { nanoid } from "platejs";

import {
  EDITOR_DOCUMENT_LIMITS,
  EDITOR_SCHEMA_VERSION,
  editorDocumentSchema,
  formatBlockLabel,
  type EditorDocument,
} from "./editor-document";
import { normalizeBlockIds, type Repair } from "./editor-document-ids";
import {
  EDITOR_ELEMENT_RULES,
  allowedElementAttrs,
  isAllowedElementAttrValue,
  isAllowedMark,
  isAllowedMarkValue,
  unsatisfiedDependentAttrs,
} from "./editor-document-schema";

export type Issue = {
  path: number[];
  message: string;
};

export type ParseResult =
  | { status: "ok"; document: EditorDocument; repairs: Repair[] }
  | { status: "invalid"; issues: Issue[]; raw: unknown }
  | { status: "unsupported"; issues: Issue[]; raw: unknown }
  | { status: "future-version"; schemaVersion: number; raw: unknown };

type WalkState = {
  nodes: number;
  invalid: Issue | undefined;
  unsupported: Issue[];
};

const textEncoder = new TextEncoder();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

function invalidResult(raw: unknown, path: number[], message: string): ParseResult {
  return {
    status: "invalid",
    issues: [{ path, message }],
    raw,
  };
}

function reject(state: WalkState, path: number[], message: string): void {
  state.invalid = { path, message };
}

function jsonByteLength(raw: unknown): number | undefined {
  try {
    const json = JSON.stringify(raw);
    if (typeof json !== "string") {
      return 0;
    }

    return textEncoder.encode(json).length;
  } catch {
    return undefined;
  }
}

function createPlateId(): string {
  return nanoid(10);
}

function countNode(state: WalkState, path: number[]): boolean {
  state.nodes += 1;
  if (state.nodes > EDITOR_DOCUMENT_LIMITS.maxNodes) {
    reject(
      state,
      path,
      `This document has more than ${EDITOR_DOCUMENT_LIMITS.maxNodes} blocks. Restore from a backup or remove content.`,
    );
    return false;
  }

  return true;
}

function walkText(value: Record<string, unknown>, path: number[], state: WalkState): void {
  if (!countNode(state, path)) {
    return;
  }

  if (typeof value.text !== "string") {
    reject(
      state,
      path,
      `${formatBlockLabel(path)} has text that is not a string. Restore from a backup or retype that block.`,
    );
    return;
  }

  for (const key of Object.keys(value)) {
    if (key === "text") {
      continue;
    }

    if (!isAllowedMark(key)) {
      state.unsupported.push({
        path,
        message: `${formatBlockLabel(path)} has an unsupported mark "${key}". Restore from a backup or remove the mark.`,
      });
      continue;
    }

    if (isAllowedMarkValue(key, value[key])) {
      continue;
    }

    state.unsupported.push({
      path,
      message: `${formatBlockLabel(path)} has an unsupported ${key} "${markValueLabel(value[key])}". Restore from a backup or remove the mark.`,
    });
  }
}

function markValueLabel(value: unknown): string {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return "value";
}

function requiredAttr(type: string, dependent: string): string | undefined {
  for (const rule of EDITOR_ELEMENT_RULES) {
    if (rule.type !== type || !("attrRequires" in rule) || rule.attrRequires === undefined) {
      continue;
    }

    return Object.entries(rule.attrRequires).find(([key]) => key === dependent)?.[1];
  }

  return undefined;
}

function walkElement(value: Record<string, unknown>, path: number[], state: WalkState): void {
  if (path.length > EDITOR_DOCUMENT_LIMITS.maxDepth) {
    reject(
      state,
      path,
      `${formatBlockLabel(path)} is nested deeper than ${EDITOR_DOCUMENT_LIMITS.maxDepth} levels. Restore from a backup or remove the extra nesting.`,
    );
    return;
  }

  if (!countNode(state, path)) {
    return;
  }

  if (!isUnknownArray(value.children) || value.children.length === 0) {
    reject(
      state,
      path,
      `${formatBlockLabel(path)} has no children. Restore from a backup or remove the block.`,
    );
    return;
  }

  const type = value.type;
  if (typeof type !== "string" || type.length === 0) {
    reject(
      state,
      path,
      `${formatBlockLabel(path)} has no block type. Restore from a backup or remove the block.`,
    );
    return;
  }

  const allowed = allowedElementAttrs(type);
  if (allowed === undefined) {
    state.unsupported.push({
      path,
      message: `${formatBlockLabel(path)} uses an unsupported block type "${type}". Restore from a backup or remove the block.`,
    });
  }

  const unsatisfied = new Set(unsatisfiedDependentAttrs(type, value));

  for (const key of Object.keys(value)) {
    if (key === "type" || key === "children" || key === "id") {
      continue;
    }

    const attr = value[key];
    if (
      (key === "url" || key === "src") &&
      typeof attr === "string" &&
      (attr.startsWith("blob:") || attr.startsWith("data:"))
    ) {
      const scheme = attr.startsWith("blob:") ? "blob:" : "data:";
      reject(
        state,
        path,
        `${formatBlockLabel(path)} has a ${key} that starts with ${scheme}. Restore from a backup or replace that file.`,
      );
      return;
    }

    if (allowed !== undefined && allowed.has(key)) {
      if (!isAllowedElementAttrValue(type, key, attr)) {
        state.unsupported.push({
          path,
          message: `${formatBlockLabel(path)} has an unsupported ${key} "${markValueLabel(attr)}". Restore from a backup or remove the attribute.`,
        });
        continue;
      }

      const required = requiredAttr(type, key);
      if (required !== undefined && unsatisfied.has(key)) {
        state.unsupported.push({
          path,
          message: `${formatBlockLabel(path)} has an unsupported ${key} without ${required}. Restore from a backup or remove the attribute.`,
        });
      }
      continue;
    }

    state.unsupported.push({
      path,
      message: `${formatBlockLabel(path)} has an unsupported attribute "${key}". Restore from a backup or remove the attribute.`,
    });
  }

  for (let index = 0; index < value.children.length; index += 1) {
    walkDescendant(value.children[index], [...path, index], state);
    if (state.invalid) {
      return;
    }
  }
}

function walkDescendant(value: unknown, path: number[], state: WalkState): void {
  if (!isRecord(value)) {
    reject(
      state,
      path,
      `${formatBlockLabel(path)} is not a block. Restore from a backup or remove the block.`,
    );
    return;
  }

  if ("children" in value || "type" in value) {
    walkElement(value, path, state);
    return;
  }

  if ("text" in value) {
    walkText(value, path, state);
    return;
  }

  reject(
    state,
    path,
    `${formatBlockLabel(path)} is not a block. Restore from a backup or remove the block.`,
  );
}

function walkTopLevel(value: unknown, path: number[], state: WalkState): void {
  if (!isRecord(value) || !("children" in value || "type" in value)) {
    reject(
      state,
      path,
      `${formatBlockLabel(path)} is not a block. Restore from a backup or remove the block.`,
    );
    return;
  }

  walkElement(value, path, state);
}

export function parseEditorDocument(raw: unknown): ParseResult {
  if (
    isRecord(raw) &&
    typeof raw.schemaVersion === "number" &&
    Number.isFinite(raw.schemaVersion) &&
    raw.schemaVersion > EDITOR_SCHEMA_VERSION
  ) {
    return {
      status: "future-version",
      schemaVersion: raw.schemaVersion,
      raw,
    };
  }

  const bytes = jsonByteLength(raw);
  if (bytes === undefined) {
    return invalidResult(raw, [], "This document cannot be saved as JSON. Restore from a backup.");
  }

  if (bytes > EDITOR_DOCUMENT_LIMITS.maxBytes) {
    return invalidResult(
      raw,
      [],
      `This document is larger than ${EDITOR_DOCUMENT_LIMITS.maxBytes} bytes. Restore from a backup or remove content.`,
    );
  }

  const envelope = editorDocumentSchema.safeParse(raw);
  if (!envelope.success) {
    return invalidResult(
      raw,
      [],
      "This document is missing a schema version, document id, revision, or content. Restore from a backup.",
    );
  }

  const state: WalkState = {
    nodes: 0,
    invalid: undefined,
    unsupported: [],
  };

  for (let index = 0; index < envelope.data.content.length; index += 1) {
    walkTopLevel(envelope.data.content[index], [index], state);
    if (state.invalid) {
      return {
        status: "invalid",
        issues: [state.invalid],
        raw,
      };
    }
  }

  if (state.unsupported.length > 0) {
    return {
      status: "unsupported",
      issues: state.unsupported,
      raw,
    };
  }

  const normalized = normalizeBlockIds(envelope.data.content, createPlateId);

  return {
    status: "ok",
    document: {
      schemaVersion: envelope.data.schemaVersion,
      documentId: envelope.data.documentId,
      revision: envelope.data.revision,
      content: normalized.content,
    },
    repairs: normalized.repairs,
  };
}
