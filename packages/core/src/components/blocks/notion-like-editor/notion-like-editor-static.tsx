import { createStaticEditor, PlateStatic } from "platejs/static";

import type { EditorValue } from "./lib/document/editor-value";
import { editorStaticPlugins } from "./lib/static/editor-static-plugins";
import { readStaticValue } from "./lib/static/read-static-value";

export type NotionLikeEditorStaticProps = {
  value: EditorValue;
  className?: string;
};

export function NotionLikeEditorStatic({ value, className }: NotionLikeEditorStaticProps) {
  const content = readStaticValue(value);
  if (content === null) {
    return <div className={className} />;
  }

  const editor = createStaticEditor({
    plugins: editorStaticPlugins,
    value: content,
  });

  const surface = className ? `${className} whitespace-pre-wrap` : "whitespace-pre-wrap";
  return <PlateStatic editor={editor} className={surface} />;
}
