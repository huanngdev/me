import { Children, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { PlateElement, useEditorRef, usePluginOption, type PlateElementProps } from "platejs/react";

import { cn } from "@/lib/utils";

import { LIST_SIBLING_GAP_CLASS } from "./block-list";
import { toggleOpen, togglePlugin } from "../../lib/plugins/editor-toggle";
import { EditorIconButton } from "../ui/block-toolbar";

// Tailwind v4 stacks variants (https://tailwindcss.com/docs/hover-focus-and-other-states#variant-groups).
// The label is the first child. The gutter is contenteditable="false", so closing hides
// only the content and leaves that button on screen. Children stay in the DOM.
export const TOGGLE_HIDDEN_CONTENT_CLASS =
  "data-[open=false]:[&>:not(:first-child):not([contenteditable=false])]:hidden";

// The label row is a flex line, so a heading's first:mt-0 no longer matches.
// Descendant headings are toggle labels. Content headings normalize to paragraphs.
// pl-9 is the 32px icon button plus the 4px gap, so content starts under the label.
export const TOGGLE_LABEL_MARGIN_CLASS = "[&_h1]:mt-0 [&_h2]:mt-0 [&_h3]:mt-0";

export const TOGGLE_CLASS_NAME = cn(
  "space-y-2 [&>:not(:first-child)]:pl-9",
  LIST_SIBLING_GAP_CLASS,
  TOGGLE_HIDDEN_CONTENT_CLASS,
  TOGGLE_LABEL_MARGIN_CLASS,
);

function elementId(element: PlateElementProps["element"]): string | undefined {
  if (!("id" in element) || typeof element.id !== "string" || element.id.length === 0) {
    return undefined;
  }

  return element.id;
}

function plainText(node: unknown): string {
  if (!node || typeof node !== "object") {
    return "";
  }

  if ("text" in node && typeof node.text === "string" && !("children" in node)) {
    return node.text;
  }

  if (!("children" in node) || !Array.isArray(node.children)) {
    return "";
  }

  return node.children.map((child: unknown) => plainText(child)).join("");
}

function labelText(element: PlateElementProps["element"]): string {
  const first = element.children[0];
  if (!first || typeof first !== "object") {
    return "";
  }

  return plainText(first);
}

function labelNodes(children: ReactNode): { label: ReactNode; content: ReactNode[] } {
  const nodes = Children.toArray(children);
  return { label: nodes[0], content: nodes.slice(1) };
}

function keepCaret(event: { preventDefault: () => void }): void {
  event.preventDefault();
}

export function ToggleElement(props: PlateElementProps) {
  const editor = useEditorRef();
  const openIds = usePluginOption(togglePlugin, "openIds");
  const id = elementId(props.element);
  const open = id !== undefined && openIds instanceof Set && openIds.has(id);
  const text = labelText(props.element);
  const action = open ? "Collapse" : "Expand";
  const { label, content } = labelNodes(props.children);

  return (
    <PlateElement
      {...props}
      attributes={{
        ...props.attributes,
        "data-open": open ? "true" : "false",
      }}
      className={cn(TOGGLE_CLASS_NAME, props.className)}
    >
      <div className="flex items-center gap-1">
        <div className="shrink-0" contentEditable={false}>
          <EditorIconButton
            variant="ghost"
            label={text.length > 0 ? `${action} ${text}` : action}
            aria-expanded={open}
            icon={
              <ChevronRight
                aria-hidden="true"
                className={cn(
                  "size-4 transition-transform duration-150 ease-out motion-reduce:transition-none",
                  open && "rotate-90",
                )}
              />
            }
            onMouseDown={keepCaret}
            onClick={() => {
              if (id === undefined) {
                return;
              }

              toggleOpen(editor, id);
            }}
          />
        </div>
        <div className="min-w-0 flex-1">{label}</div>
      </div>
      {content}
    </PlateElement>
  );
}
