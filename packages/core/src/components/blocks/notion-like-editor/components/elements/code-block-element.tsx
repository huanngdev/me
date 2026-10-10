import { useEffect, useRef, useState } from "react";
import { resetCodeBlockDecorations, setCodeBlockToDecorations } from "@platejs/code-block";
import { Check, ChevronDown, Copy } from "lucide-react";
import {
  ElementApi,
  KEYS,
  NodeApi,
  type NodeEntry,
  type TCodeBlockElement,
  type TElement,
} from "platejs";
import {
  PlateElement,
  PlateLeaf,
  useEditorRef,
  useElement,
  useReadOnly,
  type PlateElementProps,
  type PlateLeafProps,
} from "platejs/react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/dropdown-menu";
import { cn } from "@/lib/utils";

import { MENU_ITEM_ACTIVE_CHECKED } from "../../lib/features/editor-menu-active";

import { runEditorCommand, setCodeLanguage } from "../../lib/commands/editor-commands";
import { EditorIconButton, EditorMenuTrigger, retainScroll } from "../ui/block-toolbar";
import { ScrollFadeArea } from "../ui/editor-scroll";
import { ensureCodeLanguage } from "../../lib/features/editor-code";
import {
  CODE_LANGS,
  CODE_LANG_LABELS,
  type CodeLang,
} from "../../lib/document/editor-document-schema";

const CODE_BLOCK_CLASS_NAME =
  "editor-code group relative my-0 max-w-full overflow-hidden rounded-md border border-border bg-muted text-foreground [font-family:var(--editor-font-mono)] [tab-size:2]";

const CODE_SCROLL_CLASS_NAME = "block px-3 py-2 font-mono text-base whitespace-pre [tab-size:2]";

const TOOLBAR_CLASS_NAME =
  "absolute top-1.5 right-1.5 z-10 flex items-center gap-1 opacity-0 pointer-events-none group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 [@media(hover:none)]:pointer-events-auto [@media(hover:none)]:opacity-100";

function elementLang(element: object): CodeLang | null {
  if (!("lang" in element)) {
    return null;
  }

  const value = Reflect.get(element, "lang");
  const stored = CODE_LANGS.find((lang) => lang === value);
  return stored ?? null;
}

function codeText(element: TElement): string {
  return element.children.map((line) => NodeApi.string(line)).join("\n");
}

function keepEditorSelection(event: { preventDefault: () => void }): void {
  event.preventDefault();
}

function languageLabel(lang: CodeLang | null): string {
  return lang === null ? CODE_LANG_LABELS.plaintext : CODE_LANG_LABELS[lang];
}

export function CodeBlockElement(props: PlateElementProps) {
  const editor = useEditorRef();
  const element = useElement();
  const readOnly = useReadOnly();
  const lang = elementLang(element);
  const path = editor.api.findPath(element);
  const savedSelection = useRef(editor.selection);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) {
      return;
    }

    const timer = window.setTimeout(() => {
      setCopied(false);
    }, 1500);

    return () => {
      window.clearTimeout(timer);
    };
  }, [copied]);

  useEffect(() => {
    if (lang === null) {
      return;
    }

    let cancelled = false;
    // The first decorate runs before the grammar chunk arrives and caches an
    // empty token list on each line. Line listeners then treat that empty list
    // as unchanged, so fill the real tokens before asking them to read again.
    void ensureCodeLanguage(lang).then(() => {
      if (cancelled) {
        return;
      }

      queueMicrotask(() => {
        if (cancelled) {
          return;
        }

        for (const entry of editor.api.nodes({
          at: [],
          match: { type: KEYS.codeBlock },
        })) {
          if (!isCodeBlockEntry(entry)) {
            continue;
          }

          resetCodeBlockDecorations(entry[0]);
          setCodeBlockToDecorations(editor, entry);
        }

        editor.api.redecorate();
      });
    });

    return () => {
      cancelled = true;
    };
  }, [editor, lang]);

  async function copyCode(): Promise<void> {
    try {
      await navigator.clipboard.writeText(codeText(element));
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <PlateElement {...props} as="pre" className={CODE_BLOCK_CLASS_NAME}>
      <div className={TOOLBAR_CLASS_NAME} contentEditable={false}>
        {readOnly || path === undefined ? (
          <span className="text-muted-foreground px-1.5 py-1 text-xs">{languageLabel(lang)}</span>
        ) : (
          <DropdownMenu modal={false}>
            <EditorMenuTrigger
              label="Change code language"
              text={languageLabel(lang)}
              icon={<ChevronDown aria-hidden="true" />}
              onMouseDown={keepEditorSelection}
              onPointerDown={() => {
                savedSelection.current = editor.selection;
              }}
            />
            <DropdownMenuContent
              align="end"
              collisionPadding={8}
              hideWhenDetached
              className="w-44 overflow-hidden"
              onCloseAutoFocus={(event) => {
                event.preventDefault();
                const selection = savedSelection.current;
                retainScroll(() => {
                  editor.tf.withoutSaving(() => {
                    editor.tf.focus();
                    if (selection) {
                      editor.tf.select(selection);
                    }
                  });
                });
              }}
            >
              <ScrollFadeArea orientation="vertical" className="max-h-80">
                <DropdownMenuRadioGroup
                  value={lang ?? "plaintext"}
                  onValueChange={(value) => {
                    const next = CODE_LANGS.find((entry) => entry === value) ?? null;
                    runEditorCommand(editor, setCodeLanguage, { lang: next, at: path });
                  }}
                >
                  <DropdownMenuRadioItem
                    value="plaintext"
                    className={MENU_ITEM_ACTIVE_CHECKED}
                    onMouseDown={keepEditorSelection}
                  >
                    {CODE_LANG_LABELS.plaintext}
                  </DropdownMenuRadioItem>
                  {CODE_LANGS.map((choice) => (
                    <DropdownMenuRadioItem
                      key={choice}
                      value={choice}
                      className={MENU_ITEM_ACTIVE_CHECKED}
                      onMouseDown={keepEditorSelection}
                    >
                      {CODE_LANG_LABELS[choice]}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </ScrollFadeArea>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <EditorIconButton
          label={copied ? "Copied" : "Copy code"}
          icon={
            copied ? (
              <Check aria-hidden="true" className="size-3.5" />
            ) : (
              <Copy aria-hidden="true" className="size-3.5" />
            )
          }
          onMouseDown={keepEditorSelection}
          onClick={() => {
            void copyCode();
          }}
        />
      </div>
      <ScrollFadeArea orientation="horizontal" className="w-full">
        <code className={cn(CODE_SCROLL_CLASS_NAME)}>{props.children}</code>
      </ScrollFadeArea>
    </PlateElement>
  );
}

function isDecoratedCodeBlock(node: unknown): node is TElement & { type: typeof KEYS.codeBlock } {
  return ElementApi.isElement(node) && node.type === KEYS.codeBlock;
}

function isCodeBlockEntry(entry: NodeEntry): entry is NodeEntry<TCodeBlockElement> {
  return isDecoratedCodeBlock(entry[0]);
}

function syntaxClassName(leaf: object): string | undefined {
  if (!("className" in leaf)) {
    return undefined;
  }

  const value = Reflect.get(leaf, "className");
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

// Plate's default syntax leaf renders slate-code_syntax and drops the token
// class. The decoration keeps that class on the leaf.
export function CodeSyntaxLeaf(props: PlateLeafProps) {
  return <PlateLeaf {...props} className={syntaxClassName(props.leaf)} />;
}
