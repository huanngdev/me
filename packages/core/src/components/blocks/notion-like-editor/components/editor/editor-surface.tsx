"use client";

import type { ComponentProps, ReactNode } from "react";
import { Plate, PlateContent } from "platejs/react";

import { TooltipProvider } from "@/components/tooltip";
import { cn } from "@/lib/utils";

import { LIST_SIBLING_GAP_CLASS } from "../elements/block-list";
import type { EditorValue } from "../../lib/document/editor-value";
import { LinkPreviewProvider } from "../elements/bookmark-element";
import type { LinkPreviewAdapter } from "../../lib/features/editor-bookmark-url";
import { mentionUiPlugin } from "../../lib/plugins/editor-mention";
import { FileUploadScope, UploadEditorLink } from "../elements/file-upload-scope";
import { PageLinkScope } from "../elements/page-link-element";
import { PageLinkPicker } from "../ui/page-link-picker";
import type { PageOpenRequest, PageProvider } from "../../lib/features/editor-page-link";
import { repairMentionInputs, type MentionProvider } from "../../lib/features/editor-mention-node";
import { LinkToolbar } from "../elements/link-element";
import { BookmarkUrlPopover } from "../ui/bookmark-url-popover";
import { LinkPopover } from "../ui/link-popover";
import { MentionScope } from "../elements/mention-element";
import { BlockHandle } from "../ui/block-handle";
import { BlockSelection } from "../ui/block-selection";
import { BlockPlaceholders } from "./block-placeholders";
import { PasteRepairNotice } from "../ui/paste-repair-notice";
import { PasteUrlMenu } from "../ui/paste-url-menu";
import { SelectionToolbar } from "../ui/selection-toolbar";
import { SlashMenu } from "../ui/slash-menu";
import { EmojiSuggest } from "../ui/emoji-suggest";
import { FindBar } from "../ui/find-bar";
import { ShortcutHintsScope } from "../ui/editor-shortcut";
import type { FileUploadAdapter } from "../../lib/features/editor-file-upload";
import { applyUploadResult } from "../../lib/features/editor-media";
import { handleTailMouseDown } from "../../lib/features/editor-tail-click";
import type { EditorFeature } from "../../lib/features/editor-features";
import { useEditorFeatures } from "../../hooks/use-editor-features";

// Mounts its children only while the feature is on. It reads the features, so it is used inside Plate.
function FeatureLayer({ feature, children }: { feature: EditorFeature; children: ReactNode }) {
  const features = useEditorFeatures();
  return features[feature] ? children : null;
}

type EditorSurfaceProps = {
  editor: ComponentProps<typeof Plate>["editor"];
  readOnly: boolean;
  placeholder: string;
  ariaLabel?: string;
  onValueChange?: (value: EditorValue) => void;
  className: string;
  linkPreview?: LinkPreviewAdapter | null;
  mentionProvider?: MentionProvider | null;
  pageProvider?: PageProvider | null;
  onOpenPage?: ((request: PageOpenRequest) => void) | null;
  fileUpload?: FileUploadAdapter | null;
  onInsertedBelow?: (blockId: string) => void;
};

export function EditorSurface({
  editor,
  readOnly,
  placeholder,
  ariaLabel,
  onValueChange,
  className,
  linkPreview = null,
  mentionProvider = null,
  pageProvider = null,
  onOpenPage = null,
  fileUpload = null,
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
        <ShortcutHintsScope>
          <MentionScope provider={mentionProvider}>
            <FileUploadScope
              adapter={fileUpload}
              onDone={(blockId, file) => {
                // Refused in read-only mode, and when the block is gone. A block with a file gets the new one (Replace).
                if (editor !== null) {
                  applyUploadResult(editor, blockId, file);
                }
              }}
            >
              <UploadEditorLink />
              <PageLinkScope provider={pageProvider} onOpenPage={onOpenPage}>
                <LinkPreviewProvider adapter={linkPreview}>
                  <PasteRepairNotice />
                  <PasteUrlMenu />
                  <FeatureLayer feature="slashMenu">
                    <SlashMenu />
                  </FeatureLayer>
                  <FeatureLayer feature="emoji">
                    <EmojiSuggest />
                  </FeatureLayer>
                  <LinkToolbar />
                  <LinkPopover />
                  <BookmarkUrlPopover />
                  <FeatureLayer feature="pageLinks">
                    <PageLinkPicker />
                  </FeatureLayer>
                  <FeatureLayer feature="selectionToolbar">
                    <SelectionToolbar />
                  </FeatureLayer>
                  <FeatureLayer feature="find">
                    <FindBar />
                  </FeatureLayer>
                  <PlateContent
                    aria-label={ariaLabel}
                    aria-readonly={readOnly ? true : undefined}
                    placeholder={readOnly ? undefined : placeholder}
                    onMouseDown={(event) =>
                      editor ? handleTailMouseDown(editor, event, readOnly) : undefined
                    }
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
                  <BlockPlaceholders placeholder={placeholder} />
                  <BlockSelection />
                  <FeatureLayer feature="blockHandle">
                    <BlockHandle onInsertedBelow={onInsertedBelow} />
                  </FeatureLayer>
                </LinkPreviewProvider>
              </PageLinkScope>
            </FileUploadScope>
          </MentionScope>
        </ShortcutHintsScope>
      </Plate>
    </TooltipProvider>
  );
}
