import { ElementApi, KEYS, type TElement } from "platejs";
import {
  useEditorRef,
  useEditorSelector,
  usePluginOption,
  useReadOnly,
  type PlateElementProps,
} from "platejs/react";

import { runEditorCommand } from "./editor-commands";
import {
  linkUiPlugin,
  openInlineLink,
  openLinkPopover,
  removeInlineLink,
  setLinkHover,
} from "./editor-link";
import { isExternalLinkUrl, sanitizeLinkUrl } from "./editor-link-url";

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

  const dom = editor.api.toDOMNode(entry);
  if (dom === null || dom === undefined) {
    return null;
  }

  const rect = dom.getBoundingClientRect();

  return (
    <div
      data-link-toolbar=""
      className="bg-popover text-popover-foreground fixed z-50 flex max-w-56 flex-col gap-1 rounded-md border p-1 text-xs shadow-sm"
      style={{ top: rect.bottom + 4, left: rect.left }}
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
      <button
        type="button"
        className="hover:bg-muted rounded-md px-2 py-1 text-left"
        onClick={() => {
          runEditorCommand(editor, openInlineLink, undefined);
        }}
      >
        Open
      </button>
      <button
        type="button"
        className="hover:bg-muted rounded-md px-2 py-1 text-left"
        onClick={() => {
          openLinkPopover(editor);
        }}
      >
        Edit
      </button>
      <button
        type="button"
        className="hover:bg-muted rounded-md px-2 py-1 text-left"
        onClick={() => {
          runEditorCommand(editor, removeInlineLink, undefined);
        }}
      >
        Remove link
      </button>
    </div>
  );
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
