import type { LanguageFn } from "highlight.js";
import plaintext from "highlight.js/lib/languages/plaintext";
import { createLowlight } from "lowlight";
import { KEYS, type SlateEditor, type TElement } from "platejs";

import { CODE_LANGS, codeLangFromToken, type CodeLang } from "../document/editor-document-schema";

// Empty lowlight. plaintext is the only grammar in this module. Every other
// grammar is a dynamic import the first time a block uses that language.
const codeLowlight = createLowlight();
codeLowlight.register("plaintext", plaintext);

const LANGUAGE_LOADERS = {
  typescript: () => import("highlight.js/lib/languages/typescript"),
  tsx: () => import("highlight.js/lib/languages/typescript"),
  javascript: () => import("highlight.js/lib/languages/javascript"),
  jsx: () => import("highlight.js/lib/languages/javascript"),
  json: () => import("highlight.js/lib/languages/json"),
  html: () => import("highlight.js/lib/languages/xml"),
  css: () => import("highlight.js/lib/languages/css"),
  bash: () => import("highlight.js/lib/languages/bash"),
  python: () => import("highlight.js/lib/languages/python"),
  go: () => import("highlight.js/lib/languages/go"),
  rust: () => import("highlight.js/lib/languages/rust"),
  sql: () => import("highlight.js/lib/languages/sql"),
  markdown: () => import("highlight.js/lib/languages/markdown"),
  yaml: () => import("highlight.js/lib/languages/yaml"),
  diff: () => import("highlight.js/lib/languages/diff"),
} as const satisfies Record<CodeLang, () => Promise<{ default: LanguageFn }>>;

const loadingLanguages = new Map<CodeLang, Promise<void>>();

export { codeLowlight };

export function ensureCodeLanguage(lang: string): Promise<void> {
  const stored = CODE_LANGS.find((item) => item === lang);
  if (stored === undefined || codeLowlight.registered(stored)) {
    return Promise.resolve();
  }

  const pending = loadingLanguages.get(stored);
  if (pending !== undefined) {
    return pending;
  }

  const task = LANGUAGE_LOADERS[stored]().then((loaded) => {
    if (!codeLowlight.registered(stored)) {
      codeLowlight.register(stored, loaded.default);
    }
  });
  loadingLanguages.set(stored, task);
  return task;
}

function isHtmlElement(node: unknown): node is HTMLElement {
  return (
    typeof node === "object" &&
    node !== null &&
    "nodeType" in node &&
    node.nodeType === Node.ELEMENT_NODE &&
    "tagName" in node &&
    typeof node.tagName === "string" &&
    "childNodes" in node
  );
}

function codeClassToken(element: HTMLElement): string | undefined {
  const nested = element.querySelector("code");
  const source = nested ?? element;
  const className = source.getAttribute("class") ?? "";
  const match = /(?:^|\s)(?:language|lang)-(\S+)/.exec(className);
  return match?.[1];
}

// textContent drops <br>, so a walked tree keeps one newline per break.
function codeElementText(element: HTMLElement): string {
  let text = "";
  for (const child of Array.from(element.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      text += child.textContent ?? "";
      continue;
    }

    if (!isHtmlElement(child)) {
      continue;
    }

    if (child.tagName === "BR") {
      text += "\n";
      continue;
    }

    text += codeElementText(child);
  }

  return text;
}

// Plate's PRE parser does not read language-*. This one maps the class, then
// omits lang for plaintext and for any token outside the allowlist.
export const codeBlockHtmlDeserializer = {
  rules: [{ validNodeName: "PRE" }],
  parse({ element }: { element: HTMLElement }) {
    const text = codeElementText(element);
    const lines = text.split("\n");
    const token = codeClassToken(element);
    const lang = token === undefined ? null : codeLangFromToken(token);
    const node: TElement = {
      type: KEYS.codeBlock,
      children: (lines.length > 0 ? lines : [""]).map((line) => ({
        type: KEYS.codeLine,
        children: [{ text: line }],
      })),
    };
    if (lang !== null) {
      node.lang = lang;
    }

    return node;
  },
};

// Inside a code block the clipboard is literal text. text/plain wins. A
// text/html-only payload is inserted as the raw string, so "&amp;" stays "&amp;".
export function codeClipboardText(data: DataTransfer): string {
  const plain = data.getData("text/plain");
  if (plain.length > 0) {
    return plain;
  }

  return data.getData("text/html");
}

export function insertCodeText(editor: SlateEditor, text: string): void {
  const lines = text.split("\n");
  const first = lines[0] ?? "";
  if (first.length > 0) {
    editor.tf.insertText(first);
  }

  const rest = lines.slice(1);
  if (rest.length === 0) {
    return;
  }

  const codeLine = editor.getType(KEYS.codeLine);
  editor.tf.insertNodes(
    rest.map((line) => ({
      type: codeLine,
      children: [{ text: line }],
    })),
  );
}

export function selectionInCodeBlock(editor: SlateEditor): boolean {
  return editor.api.above({ match: { type: editor.getType(KEYS.codeBlock) } }) !== undefined;
}
