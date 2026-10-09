"use client";

import { useSyncExternalStore } from "react";
import { useEditorRef } from "platejs/react";

import { pasteRepairsOf, subscribePasteRepairs } from "./editor-paste-repairs";

export function PasteRepairNotice() {
  const editor = useEditorRef();
  const repairs = useSyncExternalStore(
    (onStoreChange) => subscribePasteRepairs(editor, onStoreChange),
    () => pasteRepairsOf(editor),
    () => pasteRepairsOf(editor),
  );

  if (repairs.length === 0) {
    return null;
  }

  return (
    <div role="status" data-paste-repair="" className="text-muted-foreground mb-2 text-sm">
      {repairs.map((repair, index) => (
        <p key={`${repair.message}-${String(index)}`}>{repair.message}</p>
      ))}
    </div>
  );
}
