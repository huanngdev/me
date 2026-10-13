import { useEditorRef } from "platejs/react";
import type { SlateEditor } from "platejs";

import { cleanFileText } from "../../lib/features/editor-file-url";
import { MEDIA_CAPTION_MAX } from "../../lib/features/editor-media-layout";
import { findBlockById } from "../../lib/features/editor-synced-block";
import { mediaStringAttr } from "../ui/block-toolbar";
import { MediaTextInput } from "./media-text-input";

function storedMediaCaption(editor: SlateEditor, id: string): string | undefined {
  const entry = findBlockById(editor, id);
  return entry === undefined ? undefined : mediaStringAttr(entry[0], "caption");
}

// The caption under a media block. It is the input restyled as text. It commits on blur and on Enter,
// and Escape restores the stored caption. Keys typed here never reach the editor. `onCommit` writes
// the caption through the block's command.
export function MediaCaptionField({
  id,
  label,
  caption,
  autoFocus,
  onSettled,
  onCommit,
}: {
  id: string;
  label: string;
  caption: string | undefined;
  autoFocus: boolean;
  onSettled: () => void;
  onCommit: (text: string) => void;
}) {
  const editor = useEditorRef();
  return (
    <MediaTextInput
      label={label}
      placeholder="Write a caption…"
      maxLength={MEDIA_CAPTION_MAX}
      initial={caption ?? ""}
      autoFocus={autoFocus}
      className="text-muted-foreground mt-2 h-auto border-0 bg-transparent px-0 text-sm shadow-none focus-visible:ring-0"
      normalize={(text) => cleanFileText(text, MEDIA_CAPTION_MAX) ?? ""}
      readStored={() => storedMediaCaption(editor, id)}
      onCommit={onCommit}
      onSettled={onSettled}
    />
  );
}
