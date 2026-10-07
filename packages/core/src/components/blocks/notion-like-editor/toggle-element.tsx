import { ChevronRight } from "lucide-react";
import { KEYS } from "platejs";
import { PlateElement, useEditorRef, usePluginOption, type PlateElementProps } from "platejs/react";

import { cn } from "@/lib/utils";

import { LIST_SIBLING_GAP_CLASS } from "./block-list";
import { toggleOpen, togglePlugin } from "./editor-toggle";

// Tailwind v4 stacks variants (https://tailwindcss.com/docs/hover-focus-and-other-states#variant-groups).
// The label is the first child. The gutter is contenteditable="false", so closing hides
// only the content and leaves that button on screen. Children stay in the DOM.
export const TOGGLE_HIDDEN_CONTENT_CLASS =
  "data-[open=false]:[&>:not(:first-child):not([contenteditable=false])]:hidden";

// pl-6 is the same gutter step as a depth-1 bullet. Content lines up under the label text.
export const TOGGLE_CLASS_NAME = cn(
  "relative space-y-2 pl-6",
  LIST_SIBLING_GAP_CLASS,
  TOGGLE_HIDDEN_CONTENT_CLASS,
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
  if (!first || typeof first !== "object" || !("type" in first) || first.type !== KEYS.p) {
    return "";
  }

  return plainText(first);
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
      <div className="absolute top-0.5 left-0" contentEditable={false}>
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
