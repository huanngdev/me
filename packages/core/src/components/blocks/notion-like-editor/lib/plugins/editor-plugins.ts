import { NodeIdPlugin, type AnyPluginConfig } from "platejs";
import { footnoteNormalizePlugin } from "./editor-footnote";
import { linkUiPlugin } from "./editor-link";
import { findPlugin } from "./editor-find";
import { mentionUiPlugin } from "./editor-mention";
import { pasteUrlPlugin } from "../paste/editor-paste-url";
import { registerEmbedPasteAction } from "../paste/editor-embed-paste";
import { bookmarkUrlPlugin } from "./editor-bookmark-popover";
import { pageLinkPickerPlugin } from "./editor-page-link-picker";
import { mediaUiPlatePlugin } from "./editor-media-ui";
import { editorInputRulesPlugin } from "./editor-input-rules";
import { editorConfigPlugin } from "./editor-config";
import { slashUiPlugin, slashWatchPlugin } from "./editor-slash";
import { emojiUiPlugin, emojiWatchPlugin } from "./editor-emoji";
import {
  blockSelectionEnterPlugin,
  blockSelectionPlugin,
  blockSelectionWatchPlugin,
} from "./editor-block-selection";
import { PasteFallbackPlugin, unsupportedMediaPlugin } from "../paste/editor-paste";
import {
  boldPlugin,
  italicPlugin,
  underlinePlugin,
  strikethroughPlugin,
  codePlugin,
  superscriptPlugin,
  subscriptPlugin,
  kbdPlugin,
  textColorPlugin,
  fontSizePlugin,
  highlightPlugin,
  fontFamilyPlugin,
} from "./groups/marks";
import {
  paragraphPlugin,
  heading1Plugin,
  heading2Plugin,
  heading3Plugin,
  blockquotePlugin,
  calloutPlugin,
  togglePlugin,
  textAlignPlugin,
  blockTonePlugin,
  blockIndentPlugin,
  blockOutdentPlugin,
  lineHeightPlugin,
  clearFormattingPlugin,
  horizontalRulePlugin,
  blockMovePlugin,
  toggleRevealPlugin,
} from "./groups/blocks";
import {
  childTypesPlugin,
  dependentAttrsPlugin,
  voidKeyboardPlugin,
  voidPropsPlugin,
  breakAbovePlugin,
} from "./groups/structure";
import { indentPlugin, listPlugin, listKeyboardPlugin } from "./groups/lists";
import {
  codeBlockPlugin,
  bookmarkPlugin,
  imagePlugin,
  filePlugin,
  videoPlugin,
  audioPlugin,
  embedPlugin,
  bookmarkToolbarPlatePlugin,
  tocPlugin,
  equationPlatePlugin,
  syncedRefPlugin,
  columnPlugin,
  columnNormalizePlugin,
} from "./groups/media";
import {
  linkPlatePlugin,
  inlineEquationPlatePlugin,
  inlineEquationUiPlatePlugin,
  inlineDatePlatePlugin,
  footnoteRefPlatePlugin,
  footnoteDefPlatePlugin,
  inlineDateUiPlatePlugin,
  pageLinkPlatePlugin,
  mentionPlatePlugin,
} from "./groups/inline";
import { tablePlugin } from "./groups/table";

export { configureMarkPlugin } from "./groups/marks";
export { pastedTodoChecked } from "./groups/lists";

export function createEditorPlugins(): AnyPluginConfig[] {
  registerEmbedPasteAction();
  return [
    // A split keeps the id it carries unless a block already has it, so undo of a merge restores
    // the second block's id. Enter still gives the new half a fresh id, because the original keeps its own.
    NodeIdPlugin.configure({ options: { reuseId: true } }),
    paragraphPlugin,
    boldPlugin,
    italicPlugin,
    underlinePlugin,
    strikethroughPlugin,
    codePlugin,
    superscriptPlugin,
    subscriptPlugin,
    kbdPlugin,
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
    horizontalRulePlugin,
    textAlignPlugin,
    blockTonePlugin,
    blockIndentPlugin,
    blockOutdentPlugin,
    lineHeightPlugin,
    clearFormattingPlugin,
    indentPlugin,
    listPlugin,
    dependentAttrsPlugin,
    listKeyboardPlugin,
    codeBlockPlugin,
    bookmarkPlugin,
    imagePlugin,
    filePlugin,
    videoPlugin,
    audioPlugin,
    embedPlugin,
    tocPlugin,
    equationPlatePlugin,
    syncedRefPlugin,
    columnPlugin,
    blockMovePlugin,
    blockSelectionPlugin,
    blockSelectionEnterPlugin,
    tablePlugin,
    linkPlatePlugin,
    linkUiPlugin,
    findPlugin,
    mentionPlatePlugin,
    inlineEquationPlatePlugin,
    inlineEquationUiPlatePlugin,
    inlineDatePlatePlugin,
    inlineDateUiPlatePlugin,
    pageLinkPlatePlugin,
    footnoteRefPlatePlugin,
    footnoteDefPlatePlugin,
    mentionUiPlugin,
    slashUiPlugin,
    slashWatchPlugin,
    emojiUiPlugin,
    emojiWatchPlugin,
    bookmarkUrlPlugin,
    pageLinkPickerPlugin,
    pasteUrlPlugin,
    unsupportedMediaPlugin,
    PasteFallbackPlugin,
    voidKeyboardPlugin,
    breakAbovePlugin,
    childTypesPlugin,
    columnNormalizePlugin,
    // Registered after the column and child-type normalizers, so it runs first and a definition
    // moved into a container becomes a paragraph before those see it.
    footnoteNormalizePlugin,
    voidPropsPlugin,
    toggleRevealPlugin,
    blockSelectionWatchPlugin,
    editorInputRulesPlugin,
    bookmarkToolbarPlatePlugin,
    mediaUiPlatePlugin,
    // Last, and it has no handlers, so it cannot change the order of any handler above.
    editorConfigPlugin,
  ];
}
