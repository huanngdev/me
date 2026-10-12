import {
  SlateElement,
  SlateLeaf,
  type SlateElementProps,
  type SlateLeafProps,
} from "platejs/static";

import {
  CODE_LANGS,
  CODE_LANG_LABELS,
  type CodeLang,
} from "../../lib/document/editor-document-schema";
import {
  CODE_BLOCK_CLASS_NAME,
  CODE_SCROLL_CLASS_NAME,
  CODE_TOOLBAR_CLASS_NAME,
} from "../elements/code-block-classes";

function elementLang(element: SlateElementProps["element"]): CodeLang | null {
  const stored = CODE_LANGS.find((lang) => lang === element.lang);
  return stored ?? null;
}

function languageLabel(lang: CodeLang | null): string {
  return lang === null ? CODE_LANG_LABELS.plaintext : CODE_LANG_LABELS[lang];
}

export function CodeBlockStatic(props: SlateElementProps) {
  const lang = elementLang(props.element);
  return (
    <SlateElement {...props} as="pre" className={CODE_BLOCK_CLASS_NAME}>
      <div className={CODE_TOOLBAR_CLASS_NAME}>
        <span className="text-muted-foreground px-1.5 py-1 text-xs">{languageLabel(lang)}</span>
      </div>
      <code className={CODE_SCROLL_CLASS_NAME}>{props.children}</code>
    </SlateElement>
  );
}

export function CodeLineStatic(props: SlateElementProps) {
  return <SlateElement {...props} as="div" />;
}

export function CodeSyntaxStatic(props: SlateLeafProps) {
  const className = typeof props.leaf.className === "string" ? props.leaf.className : undefined;
  return <SlateLeaf {...props} className={className} />;
}
