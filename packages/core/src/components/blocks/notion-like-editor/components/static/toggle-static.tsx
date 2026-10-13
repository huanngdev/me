import { Children, createElement, type ReactElement, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { SlateElement, type SlateElementProps } from "platejs/static";

import { buttonVariants } from "@/components/button";
import { cn } from "@/lib/utils";

import { TOGGLE_CLASS_NAME } from "../elements/toggle-classes";

function isElement(value: unknown): value is ReactElement<{ children?: unknown }> {
  const record = value as { $$typeof?: unknown } | null;
  return Boolean(record && typeof record === "object" && "$$typeof" in record);
}

function withChildren(element: ReactElement<{ children?: unknown }>, children: unknown): ReactNode {
  const { children: _ignored, ...rest } = element.props;
  return createElement(element.type, rest, children as ReactNode);
}

function split(children: ReactNode): { label: ReactNode; content: ReactNode } {
  const nodes = Children.toArray(children);
  const only = nodes[0];
  if (nodes.length !== 1 || !isElement(only)) {
    return { label: nodes[0] ?? children, content: nodes.slice(1) };
  }

  const slateChildren = only.props.children;
  if (!Array.isArray(slateChildren) || slateChildren.length <= 1) {
    return { label: only, content: null };
  }

  return {
    label: withChildren(only, [slateChildren[0]]),
    content: withChildren(only, slateChildren.slice(1)),
  };
}

export function ToggleStatic(props: SlateElementProps) {
  const { label, content } = split(props.children);
  return (
    <SlateElement {...props} className={TOGGLE_CLASS_NAME}>
      <details className="space-y-2 [&>:not(summary)]:pl-9">
        <summary className="flex list-none items-center gap-1 [&::-webkit-details-marker]:hidden">
          <div className="shrink-0">
            <span
              aria-hidden="true"
              className={cn(
                buttonVariants({ variant: "ghost", size: "icon" }),
                "pointer-events-none",
              )}
            >
              <ChevronRight
                aria-hidden="true"
                className="size-4 transition-transform duration-150 ease-out motion-reduce:transition-none [details[open]_&]:rotate-90"
              />
            </span>
          </div>
          <div className="min-w-0 flex-1">{label}</div>
        </summary>
        {content}
      </details>
    </SlateElement>
  );
}
