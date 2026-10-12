import { KEYS } from "platejs";
import { createPlateEditor } from "platejs/react";

import type { EditorValue } from "../document/editor-value";
import { clearPasteCaptureState, pasteRepairsOf } from "../paste/editor-paste";
import { createEditorPlugins } from "../plugins/editor-plugins";

// Same editor, same insertData, as a paste into an empty document.
export function pasteHtmlAsDocument(html: string): {
  value: EditorValue;
  repairs: readonly { message: string }[];
} {
  clearPasteCaptureState();
  const editor = createPlateEditor({
    plugins: createEditorPlugins(),
    value: [{ type: KEYS.p, id: "p", children: [{ text: "" }] }],
  });
  const data = new DataTransfer();
  data.setData("text/html", html);
  editor.tf.insertData(data);
  const repairs = pasteRepairsOf(editor).map((repair) => ({ message: repair.message }));
  const value = editor.children as EditorValue;
  clearPasteCaptureState();
  return { value, repairs };
}
