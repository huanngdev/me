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
