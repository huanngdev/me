import { CodeBlockPlugin, CodeSyntaxPlugin } from "@platejs/code-block/react";
import { ColumnItemPlugin, ColumnPlugin } from "@platejs/layout/react";
import { TocPlugin } from "@platejs/toc/react";
import { createSlatePlugin } from "platejs";
import { toPlatePlugin } from "platejs/react";
import { CodeBlockElement, CodeSyntaxLeaf } from "../../../components/elements/code-block-element";
import { BookmarkElement } from "../../../components/elements/bookmark-element";
import { AudioElement } from "../../../components/elements/audio-element";
import { EmbedElement } from "../../../components/elements/embed-element";
import { FileElement } from "../../../components/elements/file-element";
import { ImageElement } from "../../../components/elements/image-element";
import { VideoElement } from "../../../components/elements/video-element";
import { ColumnElement, ColumnGroupElement } from "../../../components/elements/column-element";
import { EquationElement } from "../../../components/elements/equation-element";
import { TocElement } from "../../../components/elements/toc-element";
import { equationPlugin, onEquationKeyDown } from "../../features/editor-equation";
import { SYNCED_REF_KEY, onSyncedRefKeyDown } from "../../features/editor-synced-block";
import { SyncedRefElement } from "../../../components/elements/synced-ref-element";
import {
  applyColumnRepair,
  isColumnBoundary,
  onColumnKeyDown,
} from "../../commands/editor-columns";
import { BOOKMARK_KEY } from "../../features/editor-bookmark-url";
import { AUDIO_KEY } from "../../features/editor-audio";
import { EMBED_KEY } from "../../features/editor-embed";
import { FILE_KEY } from "../../features/editor-file";
import { IMAGE_KEY } from "../../features/editor-image";
import { VIDEO_KEY } from "../../features/editor-video";
import { bookmarkToolbarPlugin, onBookmarkToolbarKeyDown } from "../editor-bookmark-toolbar";
import {
  caretInCodeMark,
  codeBlockHtmlDeserializer,
  codeClipboardText,
  codeLowlight,
  htmlToPlainText,
  insertCodeText,
  selectionInCodeBlock,
} from "../../features/editor-code";

export const codeBlockPlugin = CodeBlockPlugin.configurePlugin(CodeSyntaxPlugin, {
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
        if (selectionInCodeBlock(editor)) {
          insertCodeText(editor, codeClipboardText(data));
          return;
        }

        if (caretInCodeMark(editor)) {
          const plain = data.getData("text/plain");
          editor.tf.insertText(
            plain.length > 0 ? plain : htmlToPlainText(data.getData("text/html")),
          );
          return;
        }

        insertData(data);
      },
    },
  }));

export const bookmarkPlugin = createSlatePlugin({
  key: BOOKMARK_KEY,
  node: { isElement: true, isVoid: true },
  render: { node: BookmarkElement },
});

export const imagePlugin = createSlatePlugin({
  key: IMAGE_KEY,
  node: { isElement: true, isVoid: true },
  render: { node: ImageElement },
});

export const filePlugin = createSlatePlugin({
  key: FILE_KEY,
  node: { isElement: true, isVoid: true },
  render: { node: FileElement },
});

export const videoPlugin = createSlatePlugin({
  key: VIDEO_KEY,
  node: { isElement: true, isVoid: true },
  render: { node: VideoElement },
});

export const audioPlugin = createSlatePlugin({
  key: AUDIO_KEY,
  node: { isElement: true, isVoid: true },
  render: { node: AudioElement },
});

export const embedPlugin = createSlatePlugin({
  key: EMBED_KEY,
  node: { isElement: true, isVoid: true },
  render: { node: EmbedElement },
});

// toPlatePlugin, not createSlatePlugin: a Slate plugin's handlers have no onKeyDown.
// Enter on the selected bookmark opens its action popover.

export const bookmarkToolbarPlatePlugin = toPlatePlugin(bookmarkToolbarPlugin, {
  handlers: {
    onKeyDown: ({ editor, event }) => {
      onBookmarkToolbarKeyDown(editor, event);
    },
  },
});

export const tocPlugin = TocPlugin.configure({
  render: { node: TocElement },
});

// toPlatePlugin, not configure: a Slate plugin's handlers have no onKeyDown.
// Options stay on equationPlugin, and setOption looks the plugin up by key.

export const equationPlatePlugin = toPlatePlugin(equationPlugin, {
  render: { node: EquationElement },
  handlers: {
    onKeyDown: ({ editor, event }) => {
      onEquationKeyDown(editor, event);
    },
  },
});

// toPlatePlugin, not configure: a Slate plugin's handlers have no onKeyDown.
// Options stay on linkPlugin. Native LinkRules stay off so a link never stores target.

export const syncedRefPlugin = toPlatePlugin(
  createSlatePlugin({
    key: SYNCED_REF_KEY,
    node: { isElement: true, isVoid: true },
  }),
  {
    render: { node: SyncedRefElement },
    handlers: {
      onKeyDown: ({ editor, event }) => {
        onSyncedRefKeyDown(editor, event);
      },
    },
  },
);

// toPlatePlugin, not createSlatePlugin: a Slate plugin's handlers have no onKeyDown.

export const columnPlugin = ColumnPlugin.configure({
  render: { node: ColumnGroupElement },
  handlers: {
    onKeyDown: ({ editor, event }) => {
      onColumnKeyDown(editor, event);
    },
  },
}).configurePlugin(ColumnItemPlugin, {
  render: { node: ColumnElement },
});

// Runs after childTypes so a bad column tree is rewritten before Plate's
// withColumn normalizer sees it. withColumn would equalize widths without the
// 20% rule and delete an empty column instead of keeping a paragraph.

export const columnNormalizePlugin = createSlatePlugin({
  key: "columnNormalize",
}).overrideEditor(({ editor, tf: { normalizeNode, deleteBackward } }) => ({
  transforms: {
    normalizeNode(entry) {
      if (applyColumnRepair(editor)) {
        return;
      }

      normalizeNode(entry);
    },
    deleteBackward(unit) {
      if (isColumnBoundary(editor)) {
        return;
      }

      deleteBackward(unit);
    },
  },
}));
