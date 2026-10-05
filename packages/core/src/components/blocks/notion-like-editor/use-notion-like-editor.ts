import { usePlateEditor } from "platejs/react";

import { EDITOR_PLUGINS } from "./editor-plugins";
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
      plugins: EDITOR_PLUGINS,
      value: initialValue,
    },
    [documentId],
  );

  return { editor };
}
