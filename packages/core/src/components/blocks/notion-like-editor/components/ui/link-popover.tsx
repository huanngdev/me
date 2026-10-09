import { useEffect, useState } from "react";
import { useEditorRef, usePluginOption, useReadOnly } from "platejs/react";

import { Button } from "@/components/button";
import { Input } from "@/components/input";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/popover";

import { runEditorCommand } from "../../lib/commands/editor-commands";
import {
  closeLinkPopover,
  commitLinkPopover,
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
  const anchorTop = usePluginOption(linkUiPlugin, "anchorTop");
  const anchorLeft = usePluginOption(linkUiPlugin, "anchorLeft");

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
      anchorTop={anchorTop}
      anchorLeft={anchorLeft}
    />
  );
}

function LinkPopoverForm({
  editor,
  mode,
  error,
  draftUrl,
  draftLabel,
  anchorTop,
  anchorLeft,
}: {
  editor: ReturnType<typeof useEditorRef>;
  mode: string;
  error: string;
  draftUrl: string;
  draftLabel: string;
  anchorTop: number;
  anchorLeft: number;
}) {
  "use no memo";

  const [url, setUrl] = useState(draftUrl);
  const [label, setLabel] = useState(draftLabel);
  const editing = mode === "edit";
  const needsLabel = mode === "label" || editing;

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
      <PopoverAnchor asChild>
        <span
          data-link-anchor=""
          style={{
            position: "fixed",
            top: anchorTop,
            left: anchorLeft,
            width: 1,
            height: 1,
          }}
        />
      </PopoverAnchor>
      <PopoverContent
        data-link-popover=""
        data-link-mode={mode}
        align="start"
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
            <Button type="submit" size="sm">
              Save
            </Button>
            {editing ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onMouseDown={(event) => {
                  event.preventDefault();
                }}
                onClick={() => {
                  runEditorCommand(editor, openInlineLink, undefined);
                }}
              >
                Open
              </Button>
            ) : null}
            {editing ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onMouseDown={(event) => {
                  event.preventDefault();
                }}
                onClick={() => {
                  closeLinkPopover(editor);
                  runEditorCommand(editor, removeInlineLink, undefined);
                }}
              >
                Remove link
              </Button>
            ) : null}
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}
