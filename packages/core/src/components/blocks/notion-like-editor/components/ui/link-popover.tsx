import { useEffect, useState } from "react";
import { useEditorRef, usePluginOption, useReadOnly } from "platejs/react";

import { ExternalLink, Save, Unlink } from "lucide-react";
import { Input } from "@/components/input";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/popover";

import { EditorTextButton } from "./block-toolbar";

import { runEditorCommand } from "../../lib/commands/editor-commands";
import { anchorContext, rangeContextElement, rangeRect, virtualAnchor } from "./anchor-rect";
import {
  closeLinkPopover,
  commitLinkPopover,
  linkAnchorRange,
  linkUiPlugin,
  openInlineLink,
  removeInlineLink,
} from "../../lib/plugins/editor-link";

export function LinkPopover() {
  "use no memo";

  const editor = useEditorRef();
  const readOnly = useReadOnly();
  const mode = usePluginOption(linkUiPlugin, "mode");
  const error = usePluginOption(linkUiPlugin, "error");
  const draftUrl = usePluginOption(linkUiPlugin, "draftUrl");
  const draftLabel = usePluginOption(linkUiPlugin, "draftLabel");

  if (readOnly || mode === "closed") {
    return null;
  }

  return (
    <LinkPopoverForm
      editor={editor}
      mode={mode}
      error={error}
      draftUrl={draftUrl}
      draftLabel={draftLabel}
    />
  );
}

function linkDomRange(editor: ReturnType<typeof useEditorRef>): Range | null {
  const slateRange = linkAnchorRange(editor);
  if (!slateRange) {
    return null;
  }

  return editor.api.toDOMRange(slateRange) ?? null;
}

function LinkPopoverForm({
  editor,
  mode,
  error,
  draftUrl,
  draftLabel,
}: {
  editor: ReturnType<typeof useEditorRef>;
  mode: string;
  error: string;
  draftUrl: string;
  draftLabel: string;
}) {
  "use no memo";

  const [url, setUrl] = useState(draftUrl);
  const [label, setLabel] = useState(draftLabel);
  const editing = mode === "edit";
  const needsLabel = mode === "label" || editing;
  const virtualRef = virtualAnchor(
    () => rangeRect(linkDomRange(editor)),
    () => anchorContext(rangeContextElement(linkDomRange(editor))),
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        closeLinkPopover(editor);
      }
    };
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target;
      if (target instanceof Element && target.closest("[data-link-popover]") !== null) {
        return;
      }

      closeLinkPopover(editor);
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [editor]);

  return (
    <Popover open>
      <PopoverAnchor virtualRef={virtualRef} />
      <PopoverContent
        data-link-popover=""
        data-link-mode={mode}
        side="bottom"
        align="start"
        sideOffset={4}
        collisionPadding={8}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
        }}
        className="w-72 gap-2 p-2"
      >
        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            commitLinkPopover(editor, url, needsLabel ? label : "");
          }}
        >
          <Input
            aria-label="URL"
            value={url}
            placeholder="https://example.com"
            autoFocus
            onChange={(event) => {
              setUrl(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing || event.key === "Escape") {
                return;
              }
            }}
          />
          {needsLabel ? (
            <Input
              aria-label="Label"
              value={label}
              placeholder="Label"
              onChange={(event) => {
                setLabel(event.target.value);
              }}
            />
          ) : null}
          {error.length > 0 ? (
            <p role="alert" className="text-destructive text-xs">
              {error}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-1">
            <EditorTextButton
              type="submit"
              variant="default"
              label="Save"
              icon={<Save aria-hidden="true" />}
            />
            {editing ? (
              <EditorTextButton
                variant="outline"
                label="Open"
                icon={<ExternalLink aria-hidden="true" />}
                onMouseDown={(event) => {
                  event.preventDefault();
                }}
                onClick={() => {
                  runEditorCommand(editor, openInlineLink, undefined);
                }}
              />
            ) : null}
            {editing ? (
              <EditorTextButton
                variant="destructive"
                label="Remove link"
                icon={<Unlink aria-hidden="true" />}
                onMouseDown={(event) => {
                  event.preventDefault();
                }}
                onClick={() => {
                  closeLinkPopover(editor);
                  runEditorCommand(editor, removeInlineLink, undefined);
                }}
              />
            ) : null}
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}
