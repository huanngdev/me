import {
  BlockquotePlugin,
  BoldPlugin,
  CodePlugin,
  H1Plugin,
  H2Plugin,
  H3Plugin,
  HorizontalRulePlugin,
  ItalicPlugin,
  StrikethroughPlugin,
  SubscriptPlugin,
  SuperscriptPlugin,
  UnderlinePlugin,
} from "@platejs/basic-nodes/react";
import {
  FontBackgroundColorPlugin,
  FontColorPlugin,
  FontFamilyPlugin,
  FontSizePlugin,
  LineHeightPlugin,
  TextAlignPlugin,
} from "@platejs/basic-styles/react";
import { CalloutPlugin } from "@platejs/callout/react";
import { CaptionPlugin } from "@platejs/caption/react";
import { CodeBlockPlugin, CodeSyntaxPlugin } from "@platejs/code-block/react";
import { AudioPlugin, FilePlugin, ImagePlugin, VideoPlugin } from "@platejs/media/react";
import { indent, setIndent } from "@platejs/indent";
import { IndentPlugin } from "@platejs/indent/react";
import { ListStyleType, ULIST_STYLE_TYPES } from "@platejs/list";
import { ListPlugin } from "@platejs/list/react";
import { insertTableRow } from "@platejs/table";
import {
  TableCellHeaderPlugin,
  TableCellPlugin,
  TablePlugin,
  TableRowPlugin,
} from "@platejs/table/react";
import {
  KEYS,
  NodeIdPlugin,
  PathApi,
  combineTransformMatchOptions,
  createSlatePlugin,
  someHtmlElement,
  type AnyPluginConfig,
  type SlateEditor,
} from "platejs";
import type { JSX } from "react";
import { Key, ParagraphPlugin, type PlateElementProps } from "platejs/react";

import { BlockList, ListParagraph } from "./block-list";
import { BlockquoteElement } from "./blockquote-element";
import { CalloutElement } from "./callout-element";
import { CodeBlockElement, CodeSyntaxLeaf } from "./code-block-element";
import { HrElement } from "./hr-element";
import { AudioElement } from "./audio-element";
import { BookmarkElement } from "./bookmark-element";
import { BOOKMARK_KEY } from "./editor-bookmark-url";
import { EmbedElement } from "./embed-element";
import { FileElement } from "./file-element";
import { ImageElement } from "./image-element";
import { VideoElement } from "./video-element";
import { embedHtmlDeserializer } from "./editor-embed";
import { pasteUrlPlugin } from "./editor-paste-url";
import {
  flushPastedImageUploads,
  handleImageDrop,
  handleImageInsertData,
  imageHtmlDeserializer,
  imageRuntimePlugin,
} from "./editor-image";
import { audioHtmlDeserializer, ensureAudioMedia, flushPastedAudioUploads } from "./editor-audio";
import { ensureFileMedia, flushPastedFileUploads } from "./editor-file";
import { ensureVideoMedia, flushPastedVideoUploads, videoHtmlDeserializer } from "./editor-video";

const videoRuntimePlugin = ensureVideoMedia().plugin;
const audioRuntimePlugin = ensureAudioMedia().plugin;
const fileRuntimePlugin = ensureFileMedia().plugin;
import { ToggleElement } from "./toggle-element";
import {
  backspaceToggleLabel,
  breakToggleLabel,
  collectToggleIds,
  installToggleOnChange,
  openNewToggles,
  togglePlugin as toggleBasePlugin,
} from "./editor-toggle";
import {
  clearFormatting,
  containerParentType,
  exitCodeBlock,
  formatBold,
  formatCode,
  formatItalic,
  formatStrikethrough,
  formatSubscript,
  formatSuperscript,
  formatUnderline,
  runEditorCommand,
  toggleBulletedList,
  toggleNumberedList,
  toggleTodoChecked,
  toggleTodoList,
  TURN_INTO_HEADING,
  type EditorCommand,
  type HeadingLevel,
} from "./editor-commands";
import {
  FONT_FAMILIES,
  LIST_NUMBER_RANGE,
  allowedChildTypes,
  allowsFirstChild,
  containerContentType,
  elementAllowsMarks,
  allowedElementAttrs,
  isAllowedElementAttrValue,
  repairAttrKeys,
  reportsContainer,
  firstChildForbiddenAttrs,
  firstChildType,
  firstChildTypes,
  isVoidElementType,
  maxNesting,
  isAllowedValue,
  isPaletteToken,
  isWithinAttrRange,
  unsatisfiedDependentAttrs,
} from "./editor-document-schema";
import {
  codeBlockHtmlDeserializer,
  codeClipboardText,
  codeLowlight,
  insertCodeText,
  selectionInCodeBlock,
} from "./editor-code";
import { HeadingElement } from "./heading-element";
import {
  PasteFallbackPlugin,
  clearHtmlTableWidths,
  preparePastedFragment,
  rememberHtmlTableWidths,
  setPasteRepairs,
} from "./editor-paste";
import { TableCellElement, TableElement, TableRowElement } from "./table-element";
import {
  caretAtCellStart,
  fillTableWithTsv,
  normalizeTableNode,
  pastedTableTruncationMessage,
  replaceTableWithParagraph,
  selectedCellContext,
  tableCellContext,
  tableMaxRows,
  wholeTableSelection,
} from "./editor-table";

const LIST_INDENT_MAX = 6;

const paragraphPlugin = ParagraphPlugin.configure({
  render: {
    node: ListParagraph,
  },
});

type TextDecorationRule = {
  validNodeName?: string[];
  validStyle?: {
    textDecoration?: string[];
    textDecorationLine?: string[];
  };
};

type MarkPluginConfig = {
  shortcuts: {
    toggle: {
      keys?: string[][];
      handler: (context: { editor: SlateEditor }) => void;
    };
  };
  parsers?: {
    html: {
      deserializer: {
        rules: TextDecorationRule[];
        query: (context: { element: HTMLElement }) => boolean;
      };
    };
  };
  node?: {
    props: {
      className: string;
    };
  };
};

type MarkPluginOptions = {
  keys?: string[][];
  rules?: TextDecorationRule[];
  className?: string;
};

// The paragraph is text-base (16px). 0.9em would be 14.4px, under the body-text floor.
const codeLeafClassName =
  "border-border bg-muted text-foreground rounded-md border px-1.5 py-0.5 font-mono text-base";

const underlineDecorations = ["underline", "underline line-through", "line-through underline"];

const strikethroughDecorations = [
  "line-through",
  "underline line-through",
  "line-through underline",
];

// Plate matches each validStyle string exactly, and a rules array from configure replaces the old one.
const underlineRules: TextDecorationRule[] = [
  { validNodeName: ["U"] },
  { validStyle: { textDecoration: underlineDecorations } },
  { validStyle: { textDecorationLine: underlineDecorations } },
];

const strikethroughRules: TextDecorationRule[] = [
  { validNodeName: ["S", "DEL", "STRIKE"] },
  { validStyle: { textDecoration: strikethroughDecorations } },
  { validStyle: { textDecorationLine: strikethroughDecorations } },
];

function allowsTextDecoration(element: HTMLElement): boolean {
  return !someHtmlElement(
    element,
    (node) => node.style.textDecoration === "none" || node.style.textDecorationLine === "none",
  );
}

// Sets the mixed-selection shortcut and, when rules are given, the HTML deserializer.
// Both share one configure call, because a later configure replaces the first.
export function configureMarkPlugin<
  TPlugin extends { configure: (config: MarkPluginConfig) => TPlugin },
>(plugin: TPlugin, command: EditorCommand, options?: MarkPluginOptions): TPlugin {
  const config: MarkPluginConfig = {
    shortcuts: {
      toggle: {
        handler: ({ editor }) => {
          runEditorCommand(editor, command, undefined, {
            readOnly: editor.dom.readOnly,
          });
        },
      },
    },
  };

  if (options?.keys) {
    config.shortcuts.toggle.keys = options.keys;
  }

  if (options?.rules) {
    config.parsers = {
      html: {
        deserializer: {
          rules: options.rules,
          query: ({ element }) => allowsTextDecoration(element),
        },
      },
    };
  }

  if (options?.className) {
    config.node = { props: { className: options.className } };
  }

  return plugin.configure(config);
}

const boldPlugin = configureMarkPlugin(BoldPlugin, formatBold);
const italicPlugin = configureMarkPlugin(ItalicPlugin, formatItalic);
const underlinePlugin = configureMarkPlugin(UnderlinePlugin, formatUnderline, {
  rules: underlineRules,
});
const strikethroughPlugin = configureMarkPlugin(StrikethroughPlugin, formatStrikethrough, {
  keys: [[Key.Mod, Key.Shift, "x"]],
  rules: strikethroughRules,
});
const codePlugin = configureMarkPlugin(CodePlugin, formatCode, {
  keys: [[Key.Mod, "e"]],
  className: codeLeafClassName,
});
// SuperscriptPlugin ships no shortcut. "period" is KeyboardEvent.code Period, the Mod+. key.
const superscriptPlugin = configureMarkPlugin(SuperscriptPlugin, formatSuperscript, {
  keys: [[Key.Mod, "period"]],
});
// SubscriptPlugin ships no shortcut. "comma" is KeyboardEvent.code Comma, the Mod+, key.
const subscriptPlugin = configureMarkPlugin(SubscriptPlugin, formatSubscript, {
  keys: [[Key.Mod, "comma"]],
});

type TokenNodePropsOptions = {
  nodeValue?: unknown;
  props: Record<string, unknown>;
  text?: unknown;
};

// The stored value is a token. transformProps writes the theme variable so the
// leaf never receives the token string as a CSS value.
function tokenNodeProps(
  nodeKey: string,
  cssProperty: "color" | "backgroundColor" | "fontFamily",
  variablePrefix: "--editor-text" | "--editor-bg" | "--editor-font",
  isToken: (value: unknown) => boolean,
) {
  return {
    nodeKey,
    transformProps: ({ nodeValue, props }: TokenNodePropsOptions) => {
      if (!isToken(nodeValue)) {
        return {};
      }

      return {
        ...props,
        style: { [cssProperty]: `var(${variablePrefix}-${nodeValue})` },
      };
    },
  };
}

function isFontFamilyToken(value: unknown): boolean {
  return isAllowedValue(value, FONT_FAMILIES);
}

function hasCodeMark(text: unknown): boolean {
  return (
    typeof text === "object" &&
    text !== null &&
    KEYS.code in text &&
    Reflect.get(text, KEYS.code) === true
  );
}

function fontFamilyNodeProps() {
  const tokenProps = tokenNodeProps(
    KEYS.fontFamily,
    "fontFamily",
    "--editor-font",
    isFontFamilyToken,
  );

  return {
    nodeKey: tokenProps.nodeKey,
    transformProps: (options: TokenNodePropsOptions) => {
      // Inline style beats the code class, so a code leaf always gets the mono stack.
      if (isFontFamilyToken(options.nodeValue) && hasCodeMark(options.text)) {
        return {
          ...options.props,
          style: { fontFamily: "var(--editor-font-mono)" },
        };
      }

      return tokenProps.transformProps(options);
    },
  };
}

const textColorPlugin = FontColorPlugin.configure({
  inject: { nodeProps: tokenNodeProps(KEYS.color, "color", "--editor-text", isPaletteToken) },
});

// 1pt is 4/3 px. A length that is not an exact preset is left for the mark allowlist to drop.
const FONT_SIZE_LENGTH = /^(-?(?:\d+|\d*\.\d+))(px|pt)$/i;

function fontSizeFromCss(value: string): string {
  const match = FONT_SIZE_LENGTH.exec(value.trim());
  if (!match || match[2].toLowerCase() === "px") {
    return value.trim();
  }

  const px = (Number(match[1]) * 4) / 3;
  const whole = Math.round(px);
  if (Math.abs(px - whole) < 1e-6) {
    return `${whole}px`;
  }

  return `${px}px`;
}

// The stored value is already a CSS length, so Plate's default style injection renders it.
const fontSizePlugin = FontSizePlugin.configure({
  parsers: {
    html: {
      deserializer: {
        parse: ({ element, type }) => {
          const size = element.style.fontSize;
          if (!size) {
            return;
          }

          return { [type]: fontSizeFromCss(size) };
        },
      },
    },
  },
});

const highlightPlugin = FontBackgroundColorPlugin.configure({
  inject: {
    nodeProps: tokenNodeProps(
      KEYS.backgroundColor,
      "backgroundColor",
      "--editor-bg",
      isPaletteToken,
    ),
  },
  parsers: {
    html: {
      deserializer: {
        isLeaf: true,
        rules: [{ validStyle: { backgroundColor: "*" } }, { validNodeName: ["MARK"] }],
        parse: ({ element, type }) => {
          if (element.nodeName === "MARK") {
            return { [type]: "yellow" };
          }

          const background = element.style.backgroundColor;
          if (background) {
            return { [type]: background };
          }
        },
      },
    },
  },
});

const fontFamilyPlugin = FontFamilyPlugin.configure({
  inject: { nodeProps: fontFamilyNodeProps() },
});

// Unitless CSS becomes a number. px, %, and keywords stay strings for the allowlist to drop.
const UNITLESS_LINE_HEIGHT = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;

function lineHeightFromCss(value: string): number | string {
  const trimmed = value.trim();
  if (!UNITLESS_LINE_HEIGHT.test(trimmed)) {
    return trimmed;
  }

  return Number(trimmed);
}

type HeadingPluginConfig = {
  render: { node: typeof HeadingElement };
  rules: {
    delete: {
      empty: "reset";
      start: "default";
    };
  };
  shortcuts: {
    toggle: {
      keys: string[][];
      handler: (context: { editor: SlateEditor }) => void;
    };
  };
};

// Plate resets a heading on any Backspace at the block start. "default" lets a non-empty
// heading merge, and an empty heading still resets. Heading plugins ship no hotkey.
function configureHeadingPlugin<
  TPlugin extends { configure: (config: HeadingPluginConfig) => TPlugin },
>(plugin: TPlugin, level: HeadingLevel): TPlugin {
  const command = TURN_INTO_HEADING[level];

  return plugin.configure({
    render: { node: HeadingElement },
    rules: {
      delete: {
        empty: "reset",
        start: "default",
      },
    },
    shortcuts: {
      toggle: {
        keys: [[Key.Mod, Key.Alt, String(level)]],
        handler: ({ editor }) => {
          runEditorCommand(editor, command, undefined, {
            readOnly: editor.dom.readOnly,
          });
        },
      },
    },
  });
}

const heading1Plugin = configureHeadingPlugin(H1Plugin, 1);
const heading2Plugin = configureHeadingPlugin(H2Plugin, 2);
const heading3Plugin = configureHeadingPlugin(H3Plugin, 3);

function isListParagraph(node: unknown): boolean {
  return (
    typeof node === "object" &&
    node !== null &&
    "type" in node &&
    node.type === KEYS.p &&
    "listStyleType" in node &&
    typeof node.listStyleType === "string"
  );
}

function listIndentOf(node: unknown): number {
  if (typeof node !== "object" || node === null || !("indent" in node)) {
    return 1;
  }

  return typeof node.indent === "number" ? node.indent : 1;
}

function isElementRecord(node: unknown): node is Record<string, unknown> & { type: string } {
  return (
    typeof node === "object" &&
    node !== null &&
    "type" in node &&
    typeof node.type === "string" &&
    "children" in node
  );
}

// Plate's quote delete.start lifts every non-empty paragraph. A later paragraph has to
// merge, so delete.start lifts only the first child. break.empty stays on every plain
// paragraph, and liftBlock splits the container around a middle empty line.
// Callout's published rules are lineBreak, reset, and deleteExit. This match returns
// false for those, so a callout paragraph uses the same container behavior. No shortcut.
// One configure() call: a later configure() replaces __configuration and drops these rules.
function containerRules(type: string) {
  return {
    break: { empty: "lift" as const },
    delete: { start: "lift" as const },
    match: ({
      editor,
      node,
      path,
      rule,
    }: {
      editor: SlateEditor;
      node: unknown;
      path?: number[];
      rule: string;
    }) => {
      if ((rule !== "break.empty" && rule !== "delete.start") || !path || !isElementRecord(node)) {
        return false;
      }

      if (containerParentType(editor, node, path) !== type) {
        return false;
      }

      // The label's Backspace unwraps the whole container. delete.start would lift only the label.
      if (
        rule === "delete.start" &&
        path[path.length - 1] === 0 &&
        firstChildType(type) !== undefined
      ) {
        return false;
      }

      return rule === "break.empty" || !PathApi.hasPrevious(path);
    },
  };
}

function configureContainerPlugin<TNode extends (props: PlateElementProps) => JSX.Element, TResult>(
  plugin: {
    key: string;
    configure: (config: {
      render: { node: TNode };
      rules: ReturnType<typeof containerRules>;
    }) => TResult;
  },
  node: TNode,
): TResult {
  return plugin.configure({
    render: { node },
    rules: containerRules(plugin.key),
  });
}

const blockquotePlugin = configureContainerPlugin(BlockquotePlugin, BlockquoteElement);
const calloutPlugin = configureContainerPlugin(CalloutPlugin, CalloutElement);
const togglePlugin = configureContainerPlugin(toggleBasePlugin, ToggleElement).overrideEditor(
  ({ editor, tf: { insertBreak, deleteBackward, insertFragment } }) => {
    installToggleOnChange(editor);

    return {
      transforms: {
        insertBreak() {
          if (breakToggleLabel(editor, insertBreak)) {
            return;
          }

          insertBreak();
        },
        deleteBackward(unit) {
          if (backspaceToggleLabel(editor)) {
            return;
          }

          deleteBackward(unit);
        },
        insertFragment(fragment, options) {
          const before = collectToggleIds(editor);
          insertFragment(fragment, options);
          openNewToggles(editor, before);
        },
      },
    };
  },
);

// Plate's normalizeBlockquoteChildren wraps inline children in paragraphs and leaves
// block children unchanged, including a nested quote or a heading. This pass is the
// outer normalizer: it rewrites a child whose type is outside childTypes, then Plate
// only sees paragraphs or wraps leftover inlines. A disallowed void is lifted out so
// it is not retyped into an empty paragraph.
function sameTypeDepth(editor: SlateEditor, type: string, path: number[]): number {
  let depth = 1;
  let parentPath = path.slice(0, -1);
  while (parentPath.length > 0) {
    const parent = editor.api.node(parentPath);
    if (parent && isElementRecord(parent[0]) && parent[0].type === type) {
      depth += 1;
    }

    parentPath = parentPath.slice(0, -1);
  }

  return depth;
}

function normalizeContainerShape(
  editor: SlateEditor,
  node: { type: string } & Record<string, unknown>,
  path: number[],
): boolean {
  const limit = maxNesting(node.type);
  if (limit !== undefined && sameTypeDepth(editor, node.type, path) > limit) {
    editor.tf.unwrapNodes({
      at: path,
      match: (_candidate, candidatePath) => PathApi.equals(candidatePath, path),
    });
    return true;
  }

  const labels = firstChildTypes(node.type);
  const expected = firstChildType(node.type);
  if (labels === undefined || expected === undefined || !Array.isArray(node.children)) {
    return false;
  }

  const first = node.children[0];
  const childPath = path.concat(0);
  if (!isElementRecord(first) || !allowsFirstChild(node.type, first.type)) {
    editor.tf.insertNodes({ type: expected, children: [{ text: "" }] }, { at: childPath });
    return true;
  }

  const drop = firstChildForbiddenAttrs(node.type).filter((key) => key in first);
  if (drop.length === 0) {
    return false;
  }

  editor.tf.unsetNodes(drop, { at: childPath });
  return true;
}

function normalizeDisallowedChild(
  editor: SlateEditor,
  node: { type: string } & Record<string, unknown>,
  path: number[],
): boolean {
  const childTypes = allowedChildTypes(node.type);
  if (childTypes === undefined || !Array.isArray(node.children)) {
    return false;
  }

  for (let index = 0; index < node.children.length; index += 1) {
    const child = node.children[index];
    if (!isElementRecord(child) || childTypes.some((type) => type === child.type)) {
      continue;
    }

    if (index === 0 && allowsFirstChild(node.type, child.type)) {
      continue;
    }

    const childPath = path.concat(index);
    // A table cell only stores paragraphs. Lifting a media void one level would
    // leave it inside the row, so move it to after the table and keep the cell.
    if (
      (child.type === KEYS.img ||
        child.type === KEYS.video ||
        child.type === KEYS.audio ||
        child.type === KEYS.file ||
        child.type === KEYS.mediaEmbed ||
        child.type === BOOKMARK_KEY) &&
      (node.type === KEYS.td || node.type === KEYS.th)
    ) {
      if (moveMediaAfterTable(editor, path, childPath)) {
        return true;
      }
    }

    if (isVoidElementType(child.type)) {
      editor.tf.liftNodes({ at: childPath, voids: true });
      return true;
    }

    if (allowedChildTypes(child.type) !== undefined) {
      // Match this path only. A type match would also unwrap the parent quote.
      editor.tf.unwrapNodes({
        at: childPath,
        match: (_candidate, candidatePath) => PathApi.equals(candidatePath, childPath),
      });
      return true;
    }

    const target = containerContentType(node.type);
    if (target === undefined) {
      return false;
    }

    const allowed = allowedElementAttrs(target);
    const drop = Object.keys(child).filter(
      (key) => key !== "type" && key !== "children" && allowed?.has(key) !== true,
    );
    editor.tf.withoutNormalizing(() => {
      // The parent runs before the child's own pass, so marks leave with the retype.
      if (!elementAllowsMarks(child.type)) {
        stripTextMarks(editor, child.children, childPath);
      }
      editor.tf.setNodes({ type: target }, { at: childPath });
      if (drop.length > 0) {
        editor.tf.unsetNodes(drop, { at: childPath });
      }
    });
    return true;
  }

  return false;
}

function textMarkKeys(node: unknown): string[] {
  if (typeof node !== "object" || node === null || !("text" in node)) {
    return [];
  }

  if (typeof node.text !== "string" || "children" in node) {
    return [];
  }

  return Object.keys(node).filter((key) => key !== "text");
}

function stripTextMarks(editor: SlateEditor, children: unknown, path: number[]): void {
  if (!Array.isArray(children)) {
    return;
  }

  for (let index = 0; index < children.length; index += 1) {
    const keys = textMarkKeys(children[index]);
    if (keys.length > 0) {
      editor.tf.unsetNodes(keys, { at: path.concat(index) });
    }
  }
}

function normalizeDisallowedMarks(
  editor: SlateEditor,
  node: { type: string } & Record<string, unknown>,
  path: number[],
): boolean {
  if (elementAllowsMarks(node.type) || !Array.isArray(node.children)) {
    return false;
  }

  for (let index = 0; index < node.children.length; index += 1) {
    const keys = textMarkKeys(node.children[index]);
    if (keys.length === 0) {
      continue;
    }

    editor.tf.unsetNodes(keys, { at: path.concat(index) });
    return true;
  }

  return false;
}

function normalizeRepairAttrs(
  editor: SlateEditor,
  node: { type: string } & Record<string, unknown>,
  path: number[],
): boolean {
  const drop = repairAttrKeys(node.type).filter(
    (key) => key in node && !isAllowedElementAttrValue(node.type, key, node[key]),
  );
  if (drop.length === 0) {
    return false;
  }

  editor.tf.unsetNodes(drop, { at: path });
  return true;
}

const childTypesPlugin = createSlatePlugin({
  key: "childTypes",
}).overrideEditor(({ editor, tf: { normalizeNode } }) => ({
  transforms: {
    normalizeNode(entry) {
      const [node, path] = entry;
      if (
        isElementRecord(node) &&
        (normalizeRepairAttrs(editor, node, path) ||
          normalizeDisallowedMarks(editor, node, path) ||
          normalizeContainerShape(editor, node, path) ||
          normalizeDisallowedChild(editor, node, path) ||
          normalizeTableNode(editor, node, path))
      ) {
        return;
      }

      normalizeNode(entry);
    },
  },
}));

// Targets stay on paragraphs. Headings are not list items in this milestone.
// offset 0 keeps the paragraph from adding a second margin; the ul padding is the visible step.
const indentPlugin = IndentPlugin.configure({
  inject: {
    targetPlugins: [KEYS.p],
  },
  options: {
    indentMax: LIST_INDENT_MAX,
    offset: 0,
    unit: "px",
  },
});

function isUnorderedListStyle(style: string): boolean {
  return ULIST_STYLE_TYPES.some((item) => item === style);
}

function isKnownListStyle(style: string): boolean {
  return Object.values(ListStyleType).some((item) => item === style);
}

// Nested Google Docs items use lower-alpha or lower-roman. The stored value stays decimal.
function storedListStyle(style: string | undefined): "disc" | "decimal" | undefined {
  if (style === undefined || style.length === 0) {
    return undefined;
  }

  if (isUnorderedListStyle(style)) {
    return "disc";
  }

  if (isKnownListStyle(style)) {
    return "decimal";
  }

  return undefined;
}

// Plate's LI transform marks a ul as disc and leaves <input type="checkbox"> in the item.
// The input has no text, and the HTML deserializer drops it, so this only reads.
export function pastedTodoChecked(element: HTMLElement): boolean | undefined {
  const input = element.querySelector('input[type="checkbox"]');
  if (input) {
    return input.hasAttribute("checked");
  }

  if (element.getAttribute("role") === "checkbox" || element.hasAttribute("aria-checked")) {
    return element.getAttribute("aria-checked") === "true";
  }

  return undefined;
}

// Plate's LI parser ignores ol start. The first item stores listRestart so normalizeListStart
// can derive listStart. start="1" is omitted; that is Plate's default.
function listRestartFromStart(element: HTMLElement): number | undefined {
  const list = element.closest("ol");
  if (list === null || list.querySelector("li") !== element) {
    return undefined;
  }

  const raw = list.getAttribute("start");
  if (raw === null) {
    return undefined;
  }

  const start = Number(raw);
  if (!isWithinAttrRange(start, LIST_NUMBER_RANGE) || start === LIST_NUMBER_RANGE.min) {
    return undefined;
  }

  return start;
}

// The "1. " markdown trigger is deferred to DEV-126. OrderedListRules stays unregistered.
const listPlugin = ListPlugin.configure({
  inject: {
    targetPlugins: [KEYS.p],
  },
  options: {
    // Plate's normalizer passes breakOnEqIndentNeqListStyleType: false, then spreads these
    // options, so a bullet at the same depth ends the numbered run.
    // normalizeListStart treats every non-bullet style, including "todo", as ordered and
    // would write listStart on the next to-do. A to-do is not a numbered run, so that search stops.
    getSiblingListOptions: {
      breakOnEqIndentNeqListStyleType: true,
      breakQuery: (_sibling, current) =>
        "listStyleType" in current && current.listStyleType === KEYS.listTodo,
    },
  },
  parsers: {
    html: {
      deserializer: {
        parse: ({ editor, element }) => {
          const dataIndent = element.dataset.indent;
          const ariaLevel = element.getAttribute("aria-level");
          const indent = dataIndent ? Number(dataIndent) : Number(ariaLevel);
          const checked = pastedTodoChecked(element);
          if (checked !== undefined) {
            return {
              checked,
              indent: indent || undefined,
              listStyleType: KEYS.listTodo,
              type: editor.getType(KEYS.p),
            };
          }

          const listStyleType = storedListStyle(element.dataset.listStyleType);
          const listRestart = listRestartFromStart(element);

          return {
            indent: indent || undefined,
            listStyleType,
            listRestart,
            type: editor.getType(KEYS.p),
          };
        },
      },
    },
  },
  render: {
    belowNodes: BlockList,
  },
  shortcuts: {
    toggleBulleted: {
      keys: [[Key.Mod, Key.Shift, "8"]],
      handler: ({ editor }) => {
        runEditorCommand(editor, toggleBulletedList, undefined, {
          readOnly: editor.dom.readOnly,
        });
      },
    },
    toggleNumbered: {
      keys: [[Key.Mod, Key.Shift, "7"]],
      handler: ({ editor }) => {
        runEditorCommand(editor, toggleNumberedList, undefined, {
          readOnly: editor.dom.readOnly,
        });
      },
    },
    toggleTodo: {
      keys: [[Key.Mod, Key.Shift, "9"]],
      handler: ({ editor }) => {
        runEditorCommand(editor, toggleTodoList, undefined, {
          readOnly: editor.dom.readOnly,
        });
      },
    },
    toggleChecked: {
      keys: [[Key.Mod, "Enter"]],
      handler: ({ editor }) => {
        // One shortcut. Inside a code block it exits. Everywhere else it checks a to-do.
        const command = selectionInCodeBlock(editor) ? exitCodeBlock : toggleTodoChecked;
        runEditorCommand(editor, command, undefined, {
          readOnly: editor.dom.readOnly,
        });
      },
    },
  },
});

// attrRequires is the only dependent-attr rule. Plate's normalizeListStart deletes
// listStart on a disc item and leaves listRestart. This pass removes every unsatisfied
// dependent, then returns so the next pass reads the updated node.
const dependentAttrsPlugin = createSlatePlugin({
  key: "dependentAttrs",
}).overrideEditor(({ editor, tf: { normalizeNode } }) => ({
  transforms: {
    normalizeNode(entry) {
      const [node, path] = entry;
      if (isElementRecord(node)) {
        const unsatisfied = unsatisfiedDependentAttrs(node.type, node);
        if (unsatisfied.length > 0) {
          editor.tf.unsetNodes(unsatisfied, { at: path });
          return;
        }
      }

      normalizeNode(entry);
    },
  },
}));

// IndentPlugin's Tab indents every paragraph. Outside a list, Tab must leave the editor.
// At the depth cap, Tab is handled and changes nothing.
const listKeyboardPlugin = createSlatePlugin({
  key: "listKeyboard",
}).overrideEditor(({ editor, tf: { deleteBackward } }) => ({
  transforms: {
    tab(options?: { reverse?: boolean }) {
      const items = [
        ...editor.api.nodes({
          block: true,
          match: (node) => isListParagraph(node),
        }),
      ];
      if (items.length === 0) {
        return false;
      }

      const match = (node: unknown) => isListParagraph(node);
      if (options?.reverse) {
        // Same unset as outdentList: indent 1 drops listStyleType and indent together.
        setIndent(editor, {
          offset: -1,
          unsetNodesProps: [KEYS.listType, KEYS.listChecked],
          getNodesOptions: { match },
        });
        return true;
      }

      if (!items.some(([node]) => listIndentOf(node) < LIST_INDENT_MAX)) {
        return true;
      }

      indent(editor, {
        getNodesOptions: {
          match: (node) => isListParagraph(node) && listIndentOf(node) < LIST_INDENT_MAX,
        },
      });
      return true;
    },
    deleteBackward(unit) {
      const selection = editor.selection;
      const block = selection ? editor.api.block() : undefined;
      if (
        block &&
        isListParagraph(block[0]) &&
        editor.api.isCollapsed() &&
        editor.api.isAt({ start: true }) &&
        !editor.api.isEmpty(selection, { block: true })
      ) {
        editor.tf.unsetNodes([KEYS.listType, KEYS.indent], { at: block[1] });
        return;
      }

      deleteBackward(unit);
    },
  },
}));

const textAlignPlugin = TextAlignPlugin.configure({
  inject: {
    targetPlugins: [KEYS.p, KEYS.h1, KEYS.h2, KEYS.h3],
  },
});

const lineHeightPlugin = LineHeightPlugin.configure({
  inject: {
    // 0 is not a preset. Plate unsets the attribute when setLineHeight receives it,
    // and the injector skips only that sentinel, so 1.5 still renders.
    // Headings are not targets. Their leading stays on the heading component.
    nodeProps: {
      nodeKey: "lineHeight",
      defaultNodeValue: 0,
    },
    targetPlugins: [KEYS.p],
    targetPluginToInject: ({ editor }) => ({
      parsers: {
        html: {
          deserializer: {
            parse: ({ element }) => {
              const raw = element.style.lineHeight;
              if (!raw) {
                return;
              }

              return { [editor.getType(KEYS.lineHeight)]: lineHeightFromCss(raw) };
            },
          },
        },
      },
    }),
  },
});

// "Backslash" is KeyboardEvent.code Backslash, the Mod+\ key. Plate has no clear-formatting plugin.
const clearFormattingPlugin = createSlatePlugin({
  key: "clearFormatting",
  shortcuts: {
    clear: {
      keys: [[Key.Mod, "Backslash"]],
      handler: ({ editor }) => {
        runEditorCommand(editor, clearFormatting, undefined, {
          readOnly: editor.dom.readOnly,
        });
      },
    },
  },
});

// The empty block above becomes the first item, so a restart moves with it.
function listBreakAbove(source: object): {
  attrs: {
    listStyleType?: string;
    indent?: number;
    listRestart?: number;
    listRestartPolite?: number;
    checked?: boolean;
  };
  unset: string[];
} {
  const attrs: {
    listStyleType?: string;
    indent?: number;
    listRestart?: number;
    listRestartPolite?: number;
    checked?: boolean;
  } = {};
  const unset: string[] = [];
  if (
    !("listStyleType" in source) ||
    typeof source.listStyleType !== "string" ||
    !("indent" in source) ||
    typeof source.indent !== "number"
  ) {
    return { attrs, unset };
  }

  attrs.listStyleType = source.listStyleType;
  attrs.indent = source.indent;
  // The new first item is a fresh todo. Plate writes checked: false for that, and the
  // original item keeps the checked value it already has.
  if (source.listStyleType === KEYS.listTodo) {
    attrs.checked = false;
  }
  if ("listRestart" in source && typeof source.listRestart === "number") {
    attrs.listRestart = source.listRestart;
    unset.push(KEYS.listRestart);
  }
  if ("listRestartPolite" in source && typeof source.listRestartPolite === "number") {
    attrs.listRestartPolite = source.listRestartPolite;
    unset.push(KEYS.listRestartPolite);
  }

  return { attrs, unset };
}

function voidEntry(editor: SlateEditor): { path: number[] } | undefined {
  const selection = editor.selection;
  if (!selection || !editor.api.isCollapsed()) {
    return undefined;
  }

  const entry = editor.api.above({
    match: (node) => isElementRecord(node) && isVoidElementType(node.type),
    voids: true,
  });
  if (!entry) {
    return undefined;
  }

  return { path: entry[1] };
}

function blockString(node: unknown): string {
  if (!isElementRecord(node) || !Array.isArray(node.children)) {
    return "";
  }

  let text = "";
  for (const child of node.children) {
    if (
      typeof child === "object" &&
      child !== null &&
      "text" in child &&
      typeof child.text === "string" &&
      !("children" in child)
    ) {
      text += child.text;
    }
  }

  return text;
}

// Slate's deleteText removes a void when the caret is inside it (slate dist/index.js
// 4540-4566). The caret after that removal is not the end of the previous block, so
// this places it. Backspace at the start of the next block would otherwise skip the
// void (Editor.before, voids false) and merge the neighbors.
function removeVoid(editor: SlateEditor, path: number[]): void {
  const previous = PathApi.hasPrevious(path) ? PathApi.previous(path) : undefined;
  editor.tf.removeNodes({ at: path, voids: true });
  if (previous) {
    const end = editor.api.end(previous);
    if (end) {
      editor.tf.select(end);
    }
    return;
  }

  const start = editor.api.start(path);
  if (start) {
    editor.tf.select(start);
  }
}

function selectVoidNeighbor(editor: SlateEditor, reverse: boolean): boolean {
  const selection = editor.selection;
  const block = selection ? editor.api.block() : undefined;
  if (
    !block ||
    !isElementRecord(block[0]) ||
    isVoidElementType(block[0].type) ||
    !editor.api.isCollapsed() ||
    !editor.api.isAt(reverse ? { start: true } : { end: true })
  ) {
    return false;
  }

  const neighborPath = reverse ? PathApi.previous(block[1]) : PathApi.next(block[1]);
  if (!neighborPath) {
    return false;
  }

  const neighbor = editor.api.node(neighborPath);
  if (!neighbor || !isElementRecord(neighbor[0]) || !isVoidElementType(neighbor[0].type)) {
    return false;
  }

  // An empty block after a void is removed and the void becomes selected.
  // Delete in front of a void keeps the block, empty or not.
  if (reverse && blockString(block[0]).length === 0) {
    const voidPath = neighborPath;
    editor.tf.removeNodes({ at: block[1] });
    editor.tf.select(voidPath);
    return true;
  }

  editor.tf.select(neighborPath);
  return true;
}

// Chrome's keydown calls deleteBackward("block") on a selected void (slate-react
// dist/index.js 4332-4343). beforeinput deleteContentBackward calls deleteBackward()
// with the default character unit (3539-3541). Both remove only the void.
const voidKeyboardPlugin = createSlatePlugin({
  key: "voidKeyboard",
}).overrideEditor(({ editor, tf: { deleteBackward, deleteForward } }) => ({
  transforms: {
    deleteBackward(unit) {
      const selected = voidEntry(editor);
      if (selected) {
        removeVoid(editor, selected.path);
        return;
      }

      if (selectVoidNeighbor(editor, true)) {
        return;
      }

      deleteBackward(unit);
    },
    deleteForward(unit) {
      const selected = voidEntry(editor);
      if (selected) {
        removeVoid(editor, selected.path);
        return;
      }

      if (selectVoidNeighbor(editor, false)) {
        return;
      }

      deleteForward(unit);
    },
  },
}));

function isPropsRecord(props: unknown): props is Record<string, unknown> {
  return typeof props === "object" && props !== null && !Array.isArray(props);
}

// A void accepts the write only when every key is in its attrs. `type` never is.
function voidAcceptsProps(type: string, props: Record<string, unknown>): boolean {
  const allowed = allowedElementAttrs(type);
  return Object.keys(props).every((key) => key !== "type" && allowed?.has(key) === true);
}

// combineTransformMatchOptions (@platejs/slate dist/index.js:472) keeps the caller's
// match. An object is tested key-by-key (index.js:409 and getMatch at 435). A function
// is called as given. A missing match stays the node at a path, or any block.
const voidPropsPlugin = createSlatePlugin({
  key: "voidProps",
}).overrideEditor(({ editor, tf: { setNodes } }) => ({
  transforms: {
    setNodes(props, options) {
      if (!isPropsRecord(props)) {
        setNodes(props, options);
        return;
      }

      setNodes(props, {
        ...options,
        match: combineTransformMatchOptions(
          editor,
          (node) => {
            if (!isElementRecord(node) || !isVoidElementType(node.type)) {
              return true;
            }

            return voidAcceptsProps(node.type, props);
          },
          options,
        ),
      });
    },
  },
}));

// Plate's split at offset 0 leaves the original id on the empty first half and gives the block a new id.
// A non-empty block keeps its identity and an empty block is inserted above. Registered last so this
// runs before heading splitReset. Slate's isEmpty is false for a void, so Enter on a divider would
// insert above it. A void gets an empty paragraph after it instead.
const breakAbovePlugin = createSlatePlugin({
  key: "breakAbove",
}).overrideEditor(({ editor, tf: { insertBreak } }) => ({
  transforms: {
    insertBreak() {
      const selection = editor.selection;
      const block = selection ? editor.api.block() : undefined;
      if (
        block &&
        isElementRecord(block[0]) &&
        isVoidElementType(block[0].type) &&
        editor.api.isCollapsed()
      ) {
        const at = PathApi.next(block[1]);
        if (!at) {
          return;
        }

        editor.tf.insertNodes(editor.api.create.block(), { at, select: true });
        return;
      }

      // A code line reports its container. Enter stays a code break, including at offset 0.
      if (block && isElementRecord(block[0]) && reportsContainer(block[0].type)) {
        insertBreak();
        return;
      }

      if (
        block &&
        editor.api.isCollapsed() &&
        editor.api.isAt({ start: true }) &&
        !editor.api.isEmpty(selection, { block: true })
      ) {
        const above = editor.api.create.block();
        const copied = listBreakAbove(block[0]);
        Object.assign(above, copied.attrs);
        const sourcePath = block[1];
        // A container label (firstChildTypes) breaks above the container, not inside it.
        const parentPath = sourcePath.slice(0, -1);
        const parent = parentPath.length > 0 ? editor.api.node(parentPath) : undefined;
        const aboveContainer =
          parent !== undefined &&
          isElementRecord(parent[0]) &&
          firstChildType(parent[0].type) !== undefined &&
          sourcePath[sourcePath.length - 1] === 0;
        editor.tf.insertNodes(above, {
          at: aboveContainer ? parentPath : sourcePath,
          select: false,
        });
        const moved = PathApi.next(sourcePath);
        if (copied.unset.length > 0 && moved) {
          editor.tf.unsetNodes(copied.unset, { at: moved });
        }
        return;
      }

      insertBreak();
    },
  },
}));

// The ``` trigger is DEV-126. CodeBlockRules stays unregistered, so ``` inside a block is text.
// Shift+Enter follows Enter: a soft break would hide a newline inside one code_line.
// Tab is Plate's code tab (2 spaces). This plugin is registered after listKeyboard, so
// Tab inside code returns before the list handler, and Tab outside still reaches it.
const codeBlockPlugin = CodeBlockPlugin.configurePlugin(CodeSyntaxPlugin, {
  render: { node: CodeSyntaxLeaf },
})
  .configure({
    options: {
      defaultLanguage: null,
      lowlight: codeLowlight,
    },
    render: { node: CodeBlockElement },
    parsers: {
      html: {
        deserializer: codeBlockHtmlDeserializer,
      },
    },
  })
  .overrideEditor(({ editor, tf: { insertBreak, insertData, insertSoftBreak } }) => ({
    transforms: {
      insertSoftBreak() {
        if (selectionInCodeBlock(editor)) {
          insertBreak();
          return;
        }

        insertSoftBreak();
      },
      insertData(data: DataTransfer) {
        if (!selectionInCodeBlock(editor)) {
          insertData(data);
          return;
        }

        insertCodeText(editor, codeClipboardText(data));
      },
    },
  }));

const horizontalRulePlugin = HorizontalRulePlugin.configure({
  render: { node: HrElement },
});

// Plate's own upload writes a data URL and its embed accepts any image URL.
// Both are off. Insert, paste, and drop go through the asset pipeline.
// Plate Plus placeholder, floating media, and preview UI are not registered.
const imagePlugin = ImagePlugin.configure({
  node: { isVoid: true },
  options: {
    disableUploadInsert: true,
    disableEmbedInsert: true,
  },
  render: { node: ImageElement },
  parsers: {
    html: {
      deserializer: imageHtmlDeserializer,
    },
  },
}).overrideEditor(({ editor, tf: { insertData, insertFragment } }) => ({
  transforms: {
    insertData(data: DataTransfer) {
      handleImageInsertData(editor, data, insertData);
    },
    insertFragment(fragment, options) {
      try {
        insertFragment(fragment, options);
      } finally {
        flushPastedImageUploads(editor);
      }
    },
  },
  handlers: {
    onDrop: ({
      event,
    }: {
      event: {
        clientX: number;
        clientY: number;
        preventDefault: () => void;
        dataTransfer: DataTransfer | null;
        view: Window | null;
      };
    }) => {
      handleImageDrop(editor, {
        clientX: event.clientX,
        clientY: event.clientY,
        preventDefault: () => {
          event.preventDefault();
        },
        dataTransfer: event.dataTransfer,
        view: event.view,
      });
    },
  },
}));

const videoPlugin = VideoPlugin.configure({
  node: { isVoid: true },
  render: { node: VideoElement },
  parsers: {
    html: {
      deserializer: videoHtmlDeserializer,
    },
  },
}).overrideEditor(({ editor, tf: { insertFragment } }) => ({
  transforms: {
    insertFragment(fragment, options) {
      try {
        insertFragment(fragment, options);
      } finally {
        flushPastedVideoUploads(editor);
      }
    },
  },
}));

const audioPlugin = AudioPlugin.configure({
  node: { isVoid: true },
  render: { node: AudioElement },
  parsers: {
    html: {
      deserializer: audioHtmlDeserializer,
    },
  },
}).overrideEditor(({ editor, tf: { insertFragment } }) => ({
  transforms: {
    insertFragment(fragment, options) {
      try {
        insertFragment(fragment, options);
      } finally {
        flushPastedAudioUploads(editor);
      }
    },
  },
}));

const mediaEmbedPlugin = createSlatePlugin({
  key: KEYS.mediaEmbed,
  node: { isElement: true, isVoid: true },
  render: { node: EmbedElement },
  parsers: {
    html: {
      deserializer: embedHtmlDeserializer,
    },
  },
});

const bookmarkPlugin = createSlatePlugin({
  key: BOOKMARK_KEY,
  node: { isElement: true, isVoid: true },
  render: { node: BookmarkElement },
});

const filePlugin = FilePlugin.configure({
  node: { isVoid: true },
  render: { node: FileElement },
}).overrideEditor(({ editor, tf: { insertFragment } }) => ({
  transforms: {
    insertFragment(fragment, options) {
      try {
        insertFragment(fragment, options);
      } finally {
        flushPastedFileUploads(editor);
      }
    },
  },
}));

const captionPlugin = CaptionPlugin.configure({
  options: {
    query: {
      allow: [KEYS.img, KEYS.video, KEYS.audio, KEYS.file, KEYS.mediaEmbed],
    },
  },
});

function moveMediaAfterTable(
  editor: SlateEditor,
  cellPath: number[],
  childPath: number[],
): boolean {
  const tablePath = cellPath.slice(0, -2);
  if (tablePath.length !== cellPath.length - 2) {
    return false;
  }

  const table = editor.api.node(tablePath);
  if (!table || !isElementRecord(table[0]) || table[0].type !== KEYS.table) {
    return false;
  }

  const destination = PathApi.next(tablePath);
  if (!destination) {
    return false;
  }

  editor.tf.withoutNormalizing(() => {
    editor.tf.moveNodes({ at: childPath, to: destination, voids: true });
    const cell = editor.api.node(cellPath);
    const children =
      cell && isElementRecord(cell[0]) && Array.isArray(cell[0].children) ? cell[0].children : [];
    if (children.length === 0) {
      editor.tf.insertNodes({ type: KEYS.p, children: [{ text: "" }] }, { at: cellPath.concat(0) });
    }
  });
  return true;
}

function htmlHasTable(html: string): boolean {
  return html.toLowerCase().includes("<table");
}

// Tab inside a table, including a list item in a cell, belongs to the table.
// Registered after codeBlock and listKeyboard, so this tab runs first and the
// previous tab is code, then list. Outside a table, Tab is unchanged.
// Plate's tab stops on the last cell. Appending a row there is editable only.
// No insert shortcut. Slash menu and toolbar are DEV-122/125.
// initialTableWidth stays unset. Column insert still writes a 0 into colSizes
// when widths already exist; the command rewrites that 0 to null before normalize.
const tablePlugin = TablePlugin.configure({
  options: {
    disableMerge: false,
  },
  render: { node: TableElement },
})
  .configurePlugin(TableRowPlugin, { render: { node: TableRowElement } })
  .configurePlugin(TableCellPlugin, { render: { node: TableCellElement } })
  .configurePlugin(TableCellHeaderPlugin, { render: { node: TableCellElement } })
  .overrideEditor(
    ({ editor, tf: { deleteBackward, deleteFragment, insertData, insertFragment, tab } }) => ({
      transforms: {
        // withInsertFragmentTable inserts a single table before PasteFallback.
        // Sanitize here so that path keeps spans, caps the grid, and
        // omits an id the document already uses.
        insertFragment(fragment, options) {
          insertFragment(preparePastedFragment(editor, fragment), options);
        },
        tab(options?: { reverse?: boolean }) {
          // Plate's tab reads options.reverse and throws when options is missing.
          // The keydown handler always passes { reverse }.
          // Selecting the next cell expands the range inside that cell, so the
          // last-cell check uses the cell that contains both ends.
          const reverse = options?.reverse === true;
          const cell = selectedCellContext(editor);
          if (!cell) {
            return tab({ reverse });
          }

          const atLastCell =
            !reverse &&
            cell.rowIndex + cell.rowSpan - 1 === cell.rowCount - 1 &&
            cell.columnIndex + cell.colSpan - 1 === cell.columnCount - 1;
          if (atLastCell) {
            if (!editor.dom.readOnly && cell.rowCount < tableMaxRows()) {
              insertTableRow(editor, {
                select: false,
                fromRow: cell.tablePath.concat(cell.rowCount - 1),
              });
              const start = editor.api.start(cell.tablePath.concat(cell.rowCount, 0));
              if (start) {
                editor.tf.select(start);
              }
            }
            return true;
          }

          return tab({ reverse });
        },
        deleteBackward(unit) {
          const cell = tableCellContext(editor);
          if (cell && caretAtCellStart(editor, cell.cellPath)) {
            return;
          }

          deleteBackward(unit);
        },
        deleteFragment(direction) {
          const tablePath = wholeTableSelection(editor);
          if (tablePath) {
            replaceTableWithParagraph(editor, tablePath);
            return;
          }

          deleteFragment(direction);
          if (editor.children.length === 0) {
            editor.tf.insertNodes(
              { type: KEYS.p, children: [{ text: "" }] },
              { at: [0], select: true },
            );
          }
        },
        insertData(data: DataTransfer) {
          const html = data.getData("text/html");
          if (htmlHasTable(html)) {
            // Plate's data pipe inserts the fragment inside withoutNormalizing.
            // A table inserted that way is still inside the paragraph when
            // normalize runs, and the paragraph unwraps the rows. Deserialize,
            // then insertFragment so the sanitized table is normalized as a block.
            // Plate's cell parser keeps colspan on attributes and ignores widths.
            rememberHtmlTableWidths(html);
            try {
              const body = new DOMParser().parseFromString(html, "text/html").body;
              // happy-dom hoists a bare <col> out of the table. Widths are already
              // recorded; leaving the column in the body pastes an empty paragraph.
              for (const column of Array.from(body.querySelectorAll("col, colgroup"))) {
                column.remove();
              }
              editor.tf.insertFragment(editor.api.html.deserialize({ element: body }));
            } finally {
              clearHtmlTableWidths();
            }
            return;
          }

          const filled = fillTableWithTsv(editor, data.getData("text/plain"));
          if (!filled.handled) {
            insertData(data);
            return;
          }

          setPasteRepairs(
            editor,
            filled.truncated ? [{ path: [], message: pastedTableTruncationMessage() }] : [],
          );
        },
      },
    }),
  );

// Core skips its node-id plugin when NODE_ENV is "test" and no nodeId option is set.
// Plate splices NodeIdPlugin out of the plugins array it receives.
// TablePlugin's api override copies editor.api.onChange back onto editor.onChange
// after the toggle plugin has wrapped it. Priority 0 runs after those overrides,
// so a selection in hidden toggle content still opens the toggle.
const toggleRevealPlugin = createSlatePlugin({
  key: "toggleReveal",
  priority: 0,
}).overrideEditor(({ editor }) => {
  installToggleOnChange(editor);
  return { transforms: {} };
});

export function createEditorPlugins(): AnyPluginConfig[] {
  return [
    NodeIdPlugin,
    paragraphPlugin,
    boldPlugin,
    italicPlugin,
    underlinePlugin,
    strikethroughPlugin,
    codePlugin,
    superscriptPlugin,
    subscriptPlugin,
    textColorPlugin,
    highlightPlugin,
    fontSizePlugin,
    fontFamilyPlugin,
    heading1Plugin,
    heading2Plugin,
    heading3Plugin,
    blockquotePlugin,
    calloutPlugin,
    togglePlugin,
    // HorizontalRuleRules stays unregistered. The --- trigger is DEV-126.
    horizontalRulePlugin,
    textAlignPlugin,
    lineHeightPlugin,
    clearFormattingPlugin,
    indentPlugin,
    listPlugin,
    dependentAttrsPlugin,
    listKeyboardPlugin,
    codeBlockPlugin,
    imagePlugin,
    videoPlugin,
    audioPlugin,
    filePlugin,
    mediaEmbedPlugin,
    bookmarkPlugin,
    captionPlugin,
    imageRuntimePlugin,
    videoRuntimePlugin,
    audioRuntimePlugin,
    fileRuntimePlugin,
    tablePlugin,
    pasteUrlPlugin,
    PasteFallbackPlugin,
    voidKeyboardPlugin,
    breakAbovePlugin,
    childTypesPlugin,
    voidPropsPlugin,
    toggleRevealPlugin,
  ];
}
