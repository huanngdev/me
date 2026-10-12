import {
  BaseBlockquotePlugin,
  BaseBoldPlugin,
  BaseCodePlugin,
  BaseH1Plugin,
  BaseH2Plugin,
  BaseH3Plugin,
  BaseHorizontalRulePlugin,
  BaseItalicPlugin,
  BaseStrikethroughPlugin,
  BaseSubscriptPlugin,
  BaseSuperscriptPlugin,
  BaseUnderlinePlugin,
} from "@platejs/basic-nodes";
import {
  BaseFontBackgroundColorPlugin,
  BaseFontColorPlugin,
  BaseFontFamilyPlugin,
  BaseFontSizePlugin,
  BaseLineHeightPlugin,
  BaseTextAlignPlugin,
} from "@platejs/basic-styles";
import { BaseCalloutPlugin } from "@platejs/callout";
import { BaseCodeBlockPlugin, BaseCodeLinePlugin, BaseCodeSyntaxPlugin } from "@platejs/code-block";
import { BaseColumnItemPlugin, BaseColumnPlugin } from "@platejs/layout";
import { BaseListPlugin } from "@platejs/list";
import { BaseLinkPlugin } from "@platejs/link";
import { BaseMentionPlugin } from "@platejs/mention";
import {
  BaseTableCellHeaderPlugin,
  BaseTableCellPlugin,
  BaseTablePlugin,
  BaseTableRowPlugin,
} from "@platejs/table";
import { BaseTocPlugin } from "@platejs/toc";
import { KEYS, createSlatePlugin } from "platejs";

import { BlockquoteStatic } from "../../components/static/blockquote-static";
import { BookmarkStatic } from "../../components/static/bookmark-static";
import { CalloutStatic } from "../../components/static/callout-static";
import {
  CodeBlockStatic,
  CodeLineStatic,
  CodeSyntaxStatic,
} from "../../components/static/code-block-static";
import { codeLowlight } from "../features/editor-code";
import { ensureStaticCodeLanguages } from "../../components/static/code-highlight";

ensureStaticCodeLanguages();
import { ColumnGroupStatic, ColumnStatic } from "../../components/static/column-static";
import { EquationStatic } from "../../components/static/equation-static";
import { InlineEquationStatic } from "../../components/static/inline-equation-static";
import { HeadingStatic } from "../../components/static/heading-static";
import { HrStatic } from "../../components/static/hr-static";
import { LinkStatic } from "../../components/static/link-static";
import { ListParagraphStatic, listBelowNodes } from "../../components/static/list-static";
import { MentionStatic } from "../../components/static/mention-static";
import { SyncedStatic } from "../../components/static/synced-static";
import { TableCellStatic, TableRowStatic, TableStatic } from "../../components/static/table-static";
import { TocStatic } from "../../components/static/toc-static";
import { ToggleStatic } from "../../components/static/toggle-static";
import { BOOKMARK_KEY } from "../features/editor-bookmark-url";
import { SYNCED_REF_KEY } from "../document/editor-document-schema";
import { FONT_FAMILIES, isAllowedValue, isPaletteToken } from "../document/editor-document-schema";
import { codeLeafClassName } from "./mark-classes";
import { BaseParagraphPlugin } from "platejs";

function tokenProps(
  nodeKey: string,
  cssProperty: "color" | "backgroundColor" | "fontFamily",
  variablePrefix: "--editor-text" | "--editor-bg" | "--editor-font",
  isToken: (value: unknown) => boolean,
) {
  return {
    nodeKey,
    transformProps: ({
      nodeValue,
      props,
    }: {
      nodeValue?: unknown;
      props: Record<string, unknown>;
    }) => {
      if (!isToken(nodeValue)) {
        return {};
      }
      return { ...props, style: { [cssProperty]: `var(${variablePrefix}-${String(nodeValue)})` } };
    },
  };
}

const paragraphPlugin = BaseParagraphPlugin.configure({
  render: { node: ListParagraphStatic },
});

const listPlugin = BaseListPlugin.configure({
  render: { belowNodes: listBelowNodes },
});

const bookmarkPlugin = createSlatePlugin({
  key: BOOKMARK_KEY,
  node: { isElement: true, isVoid: true },
  render: { node: BookmarkStatic },
});

const equationPlugin = createSlatePlugin({
  key: KEYS.equation,
  node: { isElement: true, isVoid: true },
  render: { node: EquationStatic },
});

const inlineEquationPlugin = createSlatePlugin({
  key: KEYS.inlineEquation,
  node: { isElement: true, isInline: true, isVoid: true },
  render: { node: InlineEquationStatic },
});

const syncedPlugin = createSlatePlugin({
  key: SYNCED_REF_KEY,
  node: { isElement: true, isVoid: true },
  render: { node: SyncedStatic },
});

const togglePlugin = createSlatePlugin({
  key: KEYS.toggle,
  node: { isElement: true },
  render: { node: ToggleStatic },
});

export const editorStaticPlugins = [
  paragraphPlugin,
  BaseH1Plugin.configure({ render: { node: HeadingStatic } }),
  BaseH2Plugin.configure({ render: { node: HeadingStatic } }),
  BaseH3Plugin.configure({ render: { node: HeadingStatic } }),
  BaseBlockquotePlugin.configure({ render: { node: BlockquoteStatic } }),
  BaseHorizontalRulePlugin.configure({ render: { node: HrStatic } }),
  BaseBoldPlugin,
  BaseItalicPlugin,
  BaseUnderlinePlugin,
  BaseStrikethroughPlugin,
  BaseCodePlugin.configure({ node: { props: { className: codeLeafClassName } } }),
  BaseSubscriptPlugin,
  BaseSuperscriptPlugin,
  BaseFontColorPlugin.configure({
    inject: { nodeProps: tokenProps(KEYS.color, "color", "--editor-text", isPaletteToken) },
  }),
  BaseFontBackgroundColorPlugin.configure({
    inject: {
      nodeProps: tokenProps(KEYS.backgroundColor, "backgroundColor", "--editor-bg", isPaletteToken),
    },
  }),
  BaseFontSizePlugin,
  BaseFontFamilyPlugin.configure({
    inject: {
      nodeProps: tokenProps(KEYS.fontFamily, "fontFamily", "--editor-font", (value) =>
        isAllowedValue(value, FONT_FAMILIES),
      ),
    },
  }),
  BaseTextAlignPlugin.configure({
    inject: { targetPlugins: [KEYS.p, KEYS.h1, KEYS.h2, KEYS.h3] },
  }),
  BaseLineHeightPlugin.configure({
    inject: {
      nodeProps: { nodeKey: "lineHeight", defaultNodeValue: 0 },
      targetPlugins: [KEYS.p],
    },
  }),
  listPlugin,
  BaseCalloutPlugin.configure({ render: { node: CalloutStatic } }),
  togglePlugin,
  BaseCodeBlockPlugin.configurePlugin(BaseCodeSyntaxPlugin, {
    render: { node: CodeSyntaxStatic },
  }).configure({
    options: { defaultLanguage: null, lowlight: codeLowlight },
    render: { node: CodeBlockStatic },
  }),
  BaseCodeLinePlugin.configure({ render: { node: CodeLineStatic } }),
  BaseTablePlugin.configure({ render: { node: TableStatic } }),
  BaseTableRowPlugin.configure({ render: { node: TableRowStatic } }),
  BaseTableCellPlugin.configure({ render: { node: TableCellStatic } }),
  BaseTableCellHeaderPlugin.configure({ render: { node: TableCellStatic } }),
  BaseColumnPlugin.configure({ render: { node: ColumnGroupStatic } }),
  BaseColumnItemPlugin.configure({ render: { node: ColumnStatic } }),
  bookmarkPlugin,
  BaseTocPlugin.configure({ render: { node: TocStatic } }),
  equationPlugin,
  syncedPlugin,
  BaseLinkPlugin.configure({ render: { node: LinkStatic } }),
  BaseMentionPlugin.configure({ render: { node: MentionStatic } }),
  inlineEquationPlugin,
];
