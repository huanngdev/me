// highlight.js 11 ships no types for its language subpaths, so one wildcard covers every grammar import.
declare module "highlight.js/lib/languages/*" {
  import type { LanguageFn } from "highlight.js";

  const language: LanguageFn;
  export default language;
}
