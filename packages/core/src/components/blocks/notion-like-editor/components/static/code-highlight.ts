import bash from "highlight.js/lib/languages/bash";
import css from "highlight.js/lib/languages/css";
import diff from "highlight.js/lib/languages/diff";
import go from "highlight.js/lib/languages/go";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import markdown from "highlight.js/lib/languages/markdown";
import python from "highlight.js/lib/languages/python";
import rust from "highlight.js/lib/languages/rust";
import sql from "highlight.js/lib/languages/sql";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";
type HastNode = {
  type: string;
  value?: string;
  children?: HastNode[];
  properties?: { className?: string | string[] };
};

import { codeLowlight } from "../../lib/features/editor-code";
import { CODE_LANGS, type CodeLang } from "../../lib/document/editor-document-schema";

const GRAMMARS = {
  typescript,
  tsx: typescript,
  javascript,
  jsx: javascript,
  json,
  html: xml,
  css,
  bash,
  python,
  go,
  rust,
  sql,
  markdown,
  yaml,
  diff,
} as const satisfies Record<CodeLang, typeof typescript>;

let registered = false;

// The editor loads these grammars on demand. A server render cannot await that,
// so the same codeLowlight instance receives the same grammars up front.
export function ensureStaticCodeLanguages(): void {
  if (registered) {
    return;
  }
  registered = true;
  for (const lang of CODE_LANGS) {
    if (!codeLowlight.registered(lang)) {
      codeLowlight.register(lang, GRAMMARS[lang]);
    }
  }
}

export type HighlightSpan = { text: string; className?: string };

function classNameOf(node: HastNode): string | undefined {
  if (node.type !== "element") {
    return undefined;
  }
  const value = node.properties?.className;
  if (Array.isArray(value)) {
    return value.join(" ");
  }
  return typeof value === "string" ? value : undefined;
}

function walk(node: HastNode, className: string | undefined, spans: HighlightSpan[]): void {
  if (node.type === "text") {
    spans.push({ text: node.value ?? "", className });
    return;
  }
  if (node.type !== "element") {
    return;
  }
  const next = classNameOf(node) ?? className;
  for (const child of node.children ?? []) {
    walk(child, next, spans);
  }
}

export function highlightCode(lang: string | null, text: string): HighlightSpan[] {
  ensureStaticCodeLanguages();
  const language = lang !== null && codeLowlight.registered(lang) ? lang : "plaintext";
  const tree = codeLowlight.highlight(language, text) as { children: HastNode[] };
  const spans: HighlightSpan[] = [];
  for (const child of tree.children) {
    walk(child, undefined, spans);
  }
  if (spans.length === 0) {
    spans.push({ text });
  }
  return spans;
}
