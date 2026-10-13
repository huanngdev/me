import { useLayoutEffect } from "react";
import { usePlateEditor } from "platejs/react";

import { createEditorPlugins } from "../lib/plugins/editor-plugins";
import { editorConfigPlugin, editorOptions } from "../lib/plugins/editor-config";
import { EMPTY_EDITOR_VALUE, type EditorValue } from "../lib/document/editor-value";
import { editorOptionsKey, type EditorOptions } from "../lib/features/editor-options";
import { useStableEditorOptions } from "./use-editor-options";

type NotionLikeEditorOptions = {
  documentId: string;
  initialValue?: EditorValue;
  options?: EditorOptions;
};

type NotionLikeEditorResult = {
  editor: ReturnType<typeof usePlateEditor>;
};

export function useNotionLikeEditor({
  documentId,
  initialValue = EMPTY_EDITOR_VALUE,
  options,
}: NotionLikeEditorOptions): NotionLikeEditorResult {
  const editor = usePlateEditor(
    {
      id: documentId,
      plugins: createEditorPlugins(),
      value: initialValue,
    },
    [documentId],
  );

  // The editor is not recreated for a change of options. The value is written to
  // the config plugin, and components that read it re-render.
  const resolved = useStableEditorOptions(options);
  useLayoutEffect(() => {
    // Written only when the value differs, so a mount with default options writes nothing.
    if (editorOptionsKey(editorOptions(editor)) !== editorOptionsKey(resolved)) {
      editor.setOption(editorConfigPlugin, "resolved", resolved);
    }
  }, [editor, resolved]);

  return { editor };
}
