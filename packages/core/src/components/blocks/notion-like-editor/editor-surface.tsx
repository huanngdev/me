"use client";

import type { ComponentProps } from "react";
import { Plate, PlateContent } from "platejs/react";

import { cn } from "@/lib/utils";

import { LIST_SIBLING_GAP_CLASS } from "./block-list";
import type { AssetStore } from "./editor-assets";
import type { EditorValue } from "./editor-value";
import { AudioRuntime } from "./audio-element";
import { LinkPreviewProvider } from "./bookmark-element";
import type { LinkPreviewAdapter } from "./editor-bookmark-url";
import { mentionUiPlugin } from "./editor-mention";
import { repairMentionInputs, type MentionProvider } from "./editor-mention-node";
import { FileRuntime } from "./file-element";
import { ImageRuntime } from "./image-element";
import { LinkToolbar } from "./link-element";
import { LinkPopover } from "./link-popover";
import { MentionScope } from "./mention-element";
import { PasteUrlMenu } from "./paste-url-menu";
import { VideoRuntime } from "./video-element";

type EditorSurfaceProps = {
  editor: ComponentProps<typeof Plate>["editor"];
  readOnly: boolean;
  placeholder: string;
  onValueChange?: (value: EditorValue) => void;
  className: string;
  assetStore?: AssetStore | null;
  linkPreview?: LinkPreviewAdapter | null;
  mentionProvider?: MentionProvider | null;
};

export function EditorSurface({
  editor,
  readOnly,
  placeholder,
  onValueChange,
  className,
  assetStore = null,
  linkPreview = null,
  mentionProvider = null,
}: EditorSurfaceProps) {
  return (
    <Plate
      editor={editor}
      readOnly={readOnly}
      onValueChange={({ value }) => {
        const query = editor?.getOption(mentionUiPlugin, "query") ?? "";
        onValueChange?.(repairMentionInputs(value, query).content);
      }}
    >
      <MentionScope provider={mentionProvider}>
        <LinkPreviewProvider adapter={linkPreview}>
          <ImageRuntime store={assetStore} />
          <VideoRuntime store={assetStore} />
          <AudioRuntime store={assetStore} />
          <FileRuntime store={assetStore} />
          <PasteUrlMenu />
          <LinkToolbar />
          <LinkPopover />
          <PlateContent
            placeholder={readOnly ? undefined : placeholder}
            // Margin is between blocks. The first block's top stays put, so the empty-document placeholder stays aligned.
            // space-y-4 sets margin-block-end inside :where(), so its specificity is 0.
            // The list rule is one class plus two attribute selectors, and its margin-bottom wins for a list item followed by a list item.
            className={cn(className, "space-y-4", LIST_SIBLING_GAP_CLASS)}
            renderPlaceholder={(placeholderProps) => (
              <span
                {...placeholderProps.attributes}
                className="text-muted-foreground pointer-events-none absolute top-0 block w-full select-none"
                style={{ ...placeholderProps.attributes.style, opacity: 1 }}
              >
                {placeholderProps.children}
              </span>
            )}
          />
        </LinkPreviewProvider>
      </MentionScope>
    </Plate>
  );
}
