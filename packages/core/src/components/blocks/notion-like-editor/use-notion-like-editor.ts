import { usePlateEditor } from "platejs/react";

import { createEditorPlugins } from "./editor-plugins";
import { EMPTY_EDITOR_VALUE, type EditorValue } from "./editor-value";

type NotionLikeEditorOptions = {
  documentId: string;
  initialValue?: EditorValue;
};

type NotionLikeEditorResult = {
  editor: ReturnType<typeof usePlateEditor>;
};

export function useNotionLikeEditor({
  documentId,
  initialValue = EMPTY_EDITOR_VALUE,
}: NotionLikeEditorOptions): NotionLikeEditorResult {
  const editor = usePlateEditor(
    {
      id: documentId,
      plugins: createEditorPlugins(),
      value: initialValue,
    },
    [documentId],
  );

  return { editor };
}
