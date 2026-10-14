import {
  NotionLikeEditorStatic,
  type EditorValue,
} from "@repo/core/components/blocks/notion-like-editor/index";

// No "use client" here: the static renderer has no hooks, so a server component can render it.
export function NotesView({ value }: { value: EditorValue }) {
  return (
    <div className="mx-auto w-full max-w-[var(--editor-max-width,700px)]">
      <NotionLikeEditorStatic value={value} />
    </div>
  );
}
