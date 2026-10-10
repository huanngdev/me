"use client";

import type { ComponentProps } from "react";
import { Plate, PlateContent } from "platejs/react";

import { TooltipProvider } from "@/components/tooltip";
import { cn } from "@/lib/utils";

import { LIST_SIBLING_GAP_CLASS } from "../elements/block-list";
import type { EditorValue } from "../../lib/document/editor-value";
import { LinkPreviewProvider } from "../elements/bookmark-element";
import type { LinkPreviewAdapter } from "../../lib/features/editor-bookmark-url";
import { mentionUiPlugin } from "../../lib/plugins/editor-mention";
import { repairMentionInputs, type MentionProvider } from "../../lib/features/editor-mention-node";
import { LinkToolbar } from "../elements/link-element";
import { LinkPopover } from "../ui/link-popover";
import { MentionScope } from "../elements/mention-element";
import { BlockHandle } from "../ui/block-handle";
import { PasteRepairNotice } from "../ui/paste-repair-notice";
import { PasteUrlMenu } from "../ui/paste-url-menu";

type EditorSurfaceProps = {
  editor: ComponentProps<typeof Plate>["editor"];
  readOnly: boolean;
  placeholder: string;
  onValueChange?: (value: EditorValue) => void;
  className: string;
  linkPreview?: LinkPreviewAdapter | null;
  mentionProvider?: MentionProvider | null;
  onInsertedBelow?: (blockId: string) => void;
};

export function EditorSurface({
  editor,
  readOnly,
  placeholder,
  onValueChange,
  className,
  linkPreview = null,
  mentionProvider = null,
  onInsertedBelow,
}: EditorSurfaceProps) {
  return (
    <TooltipProvider>
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
            <PasteRepairNotice />
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
            <BlockHandle onInsertedBelow={onInsertedBelow} />
          </LinkPreviewProvider>
        </MentionScope>
      </Plate>
    </TooltipProvider>
  );
}
