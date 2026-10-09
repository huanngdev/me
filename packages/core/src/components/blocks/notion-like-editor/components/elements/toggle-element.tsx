import { ChevronRight } from "lucide-react";
import { PlateElement, useEditorRef, usePluginOption, type PlateElementProps } from "platejs/react";

import { cn } from "@/lib/utils";

import { LIST_SIBLING_GAP_CLASS } from "./block-list";
import { toggleOpen, togglePlugin } from "../../lib/plugins/editor-toggle";
import { headingLineClass } from "./heading-element";

// Tailwind v4 stacks variants (https://tailwindcss.com/docs/hover-focus-and-other-states#variant-groups).
// The label is the first child. The gutter is contenteditable="false", so closing hides
// only the content and leaves that button on screen. Children stay in the DOM.
export const TOGGLE_HIDDEN_CONTENT_CLASS =
  "data-[open=false]:[&>:not(:first-child):not([contenteditable=false])]:hidden";

// pl-6 is the same gutter step as a depth-1 bullet. Content lines up under the label text.
// The heading's first:mt-0 misses when a text node precedes the label. The child
// combinator still matches the label, so only that heading loses its top margin.
export const TOGGLE_LABEL_MARGIN_CLASS = "[&>:is(h1,h2,h3)]:mt-0";

export const TOGGLE_CLASS_NAME = cn(
  "relative space-y-2 pl-6",
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

function labelBlockType(element: PlateElementProps["element"]): string | undefined {
  const first = element.children[0];
  if (!first || typeof first !== "object" || !("type" in first) || typeof first.type !== "string") {
    return undefined;
  }

  return first.type;
}

function labelText(element: PlateElementProps["element"]): string {
  const first = element.children[0];
  if (!first || typeof first !== "object") {
    return "";
  }

  return plainText(first);
}

function chevronClass(labelType: string | undefined): string {
  const line = labelType === undefined ? undefined : headingLineClass(labelType);
  if (line === undefined) {
    return "top-0.5";
  }

  // 1lh is the heading's own first line, so one box covers h1, h2, and h3.
  return cn("top-0 flex h-[1lh] items-center", line);
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
  const chevron = chevronClass(labelBlockType(props.element));

  return (
    <PlateElement
      {...props}
      attributes={{
        ...props.attributes,
        "data-open": open ? "true" : "false",
      }}
      className={cn(TOGGLE_CLASS_NAME, props.className)}
    >
      {props.children}
      <div className={cn("absolute left-0", chevron)} contentEditable={false}>
        <button
          type="button"
          aria-expanded={open}
          aria-label={text.length > 0 ? `${action} ${text}` : action}
          className="text-muted-foreground hover:text-foreground inline-flex size-5 items-center justify-center rounded-sm"
          onMouseDown={keepCaret}
          onClick={() => {
            if (id === undefined) {
              return;
            }

            toggleOpen(editor, id);
          }}
        >
          <ChevronRight
            aria-hidden="true"
            className={cn(
              "size-4 transition-transform duration-150 ease-out motion-reduce:transition-none",
              open && "rotate-90",
            )}
          />
        </button>
      </div>
    </PlateElement>
  );
}
