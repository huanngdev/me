import { ExternalLink, Pencil, Unlink } from "lucide-react";
import { ElementApi, KEYS, type TElement } from "platejs";
import {
  useEditorRef,
  useEditorSelector,
  usePluginOption,
  useReadOnly,
  type PlateElementProps,
} from "platejs/react";

import { runEditorCommand } from "../../lib/commands/editor-commands";
import {
  linkUiPlugin,
  openInlineLink,
  openLinkPopover,
  removeInlineLink,
  setLinkHover,
} from "../../lib/plugins/editor-link";
import { isExternalLinkUrl, sanitizeLinkUrl } from "../../lib/features/editor-link-url";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/popover";
import { anchorContext, elementRect, virtualAnchor } from "../ui/anchor-rect";
import { EditorTextButton } from "../ui/block-toolbar";

export function LinkElement({ attributes, children, element }: PlateElementProps) {
  "use no memo";

  const editor = useEditorRef();
  const readOnly = useReadOnly();
  const url = typeof element.url === "string" ? element.url : "";
  const safe = sanitizeLinkUrl(url);
  if (safe === undefined) {
    return <span {...attributes}>{children}</span>;
  }

  const external = isExternalLinkUrl(safe);
  const id = typeof element.id === "string" ? element.id : "";
  const slateClass = typeof attributes.className === "string" ? attributes.className : "";

  return (
    <a
      {...attributes}
      href={safe}
      className={`${slateClass} link-underline`.trim()}
      data-link-url={safe}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer nofollow" : undefined}
      onMouseEnter={() => {
        if (id.length > 0) {
          setLinkHover(editor, id);
        }
      }}
      onMouseLeave={(event) => {
        const next = event.relatedTarget;
        if (next instanceof Element && next.closest("[data-link-toolbar]") !== null) {
          return;
        }

        if (editor.getOption(linkUiPlugin, "hoverId") === id) {
          setLinkHover(editor, "");
        }
      }}
      onClick={(event) => {
        if (readOnly) {
          return;
        }

        if (event.metaKey || event.ctrlKey) {
          event.preventDefault();
          window.open(safe, "_blank", "noopener,noreferrer");
          return;
        }

        event.preventDefault();
      }}
    >
      {children}
    </a>
  );
}

export function LinkToolbar() {
  "use no memo";

  const editor = useEditorRef();
  const readOnly = useReadOnly();
  const mode = usePluginOption(linkUiPlugin, "mode");
  const hoverId = usePluginOption(linkUiPlugin, "hoverId");
  const selection = useEditorSelector((current) => current.selection, []);
  const virtualRef = virtualAnchor(
    () => elementRect(linkDomNode(editor, hoverId)),
    () => anchorContext(linkDomNode(editor, hoverId)),
  );
  if (readOnly || mode !== "closed" || (selection === null && hoverId.length === 0)) {
    return null;
  }

  const entry = selectedOrHoveredLink(editor, hoverId);
  if (entry === undefined) {
    return null;
  }

  const url = typeof entry.url === "string" ? entry.url : "";
  const safe = sanitizeLinkUrl(url);
  if (safe === undefined) {
    return null;
  }

  return (
    <Popover open>
      <PopoverAnchor virtualRef={virtualRef} />
      <PopoverContent
        data-link-toolbar=""
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
        className="w-auto max-w-56 gap-1 p-1 text-xs"
        onMouseDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        onMouseLeave={(event) => {
          const next = event.relatedTarget;
          if (next instanceof Element && next.closest("[data-link-url]") !== null) {
            return;
          }

          setLinkHover(editor, "");
        }}
      >
        <span
          data-link-toolbar-url=""
          className="line-clamp-2 px-1"
          style={{ overflowWrap: "anywhere" }}
        >
          {safe}
        </span>
        <EditorTextButton
          label="Open"
          icon={<ExternalLink aria-hidden="true" />}
          className="w-full justify-start"
          onClick={() => {
            runEditorCommand(editor, openInlineLink, undefined);
          }}
        />
        <EditorTextButton
          label="Edit"
          icon={<Pencil aria-hidden="true" />}
          className="w-full justify-start"
          onClick={() => {
            openLinkPopover(editor);
          }}
        />
        <EditorTextButton
          variant="destructive"
          label="Remove link"
          icon={<Unlink aria-hidden="true" />}
          className="w-full justify-start"
          onClick={() => {
            runEditorCommand(editor, removeInlineLink, undefined);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

function linkDomNode(editor: ReturnType<typeof useEditorRef>, hoverId: string): HTMLElement | null {
  const entry = selectedOrHoveredLink(editor, hoverId);
  if (entry === undefined) {
    return null;
  }

  return editor.api.toDOMNode(entry) ?? null;
}

function selectedOrHoveredLink(
  editor: ReturnType<typeof useEditorRef>,
  hoverId: string,
): TElement | undefined {
  const selected = editor.api.above({
    match: (node) => ElementApi.isElement(node) && node.type === KEYS.link,
  });
  if (selected !== undefined && ElementApi.isElement(selected[0])) {
    return selected[0];
  }

  if (hoverId.length === 0) {
    return undefined;
  }

  const hovered = editor.api.node({
    at: [],
    match: (node) => ElementApi.isElement(node) && node.type === KEYS.link && node.id === hoverId,
  });
  if (hovered === undefined || !ElementApi.isElement(hovered[0])) {
    return undefined;
  }

  return hovered[0];
}
