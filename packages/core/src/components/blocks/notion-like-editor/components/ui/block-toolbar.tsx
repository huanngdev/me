import { createElement, Fragment, type ComponentProps, type ReactNode } from "react";
import type { TElement } from "platejs";

import { Button } from "@/components/button";
import { DropdownMenuTrigger } from "@/components/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/tooltip";

// Editor controls (DEV-142):
// Every clickable control is Button, Toggle or ToggleGroup for on/off state,
// or a menu item. Text actions use size sm. Icon-only actions use size icon.
// A row of actions on a block or selection uses ghost inside a bordered toolbar.
// Standalone actions in a popover or card use outline.
// Save, Done, Apply, and Insert use default.
// Remove and delete use destructive, with Trash2, or Unlink when removing a link.
// Action buttons in toolbars, menus, popovers, and cards have a lucide icon,
// before the label when the label is visible.
// Navigation entries, such as table-of-contents items, do not.
// An icon-only button has an aria-label and a Tooltip with the same text.
// Fields use Input, InputGroup, or Textarea. Choosers use Select, DropdownMenu, or Command.

export const MEDIA_TOOLBAR_CLASS =
  "absolute top-1 right-1 z-10 flex max-w-full flex-wrap items-center gap-1 rounded-md border border-border bg-background p-1 opacity-0 pointer-events-none group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 [@media(hover:none)]:pointer-events-auto [@media(hover:none)]:opacity-100";

type EditorButtonVariant = "default" | "outline" | "ghost" | "destructive";

type EditorTextButtonProps = Omit<
  ComponentProps<typeof Button>,
  "size" | "variant" | "children" | "aria-label"
> & {
  label: string;
  icon: ReactNode;
  variant?: EditorButtonVariant;
};

type EditorIconButtonProps = Omit<
  ComponentProps<typeof Button>,
  "size" | "variant" | "children" | "aria-label"
> & {
  label: string;
  icon: ReactNode;
  variant?: EditorButtonVariant;
};

function inlineIcon(icon: ReactNode): ReactNode {
  return createElement("span", { "data-icon": "inline-start", className: "inline-flex" }, icon);
}

export function editorControlLabel(icon: ReactNode, label: string): ReactNode {
  return createElement(Fragment, null, inlineIcon(icon), label);
}

export function EditorTextButton({
  label,
  icon,
  variant = "ghost",
  type = "button",
  className,
  ...props
}: EditorTextButtonProps) {
  return (
    <Button
      {...props}
      type={type}
      size="sm"
      variant={variant}
      aria-label={label}
      className={className}
    >
      {editorControlLabel(icon, label)}
    </Button>
  );
}

export function EditorIconButton({
  label,
  icon,
  variant = "ghost",
  type = "button",
  ...props
}: EditorIconButtonProps) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button {...props} type={type} size="icon" variant={variant} aria-label={label}>
            {icon}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function EditorMenuTrigger({
  label,
  icon,
  text,
  onMouseDown,
  onPointerDown,
}: {
  label: string;
  icon?: ReactNode;
  text?: string;
  onMouseDown?: ComponentProps<typeof Button>["onMouseDown"];
  onPointerDown?: ComponentProps<typeof Button>["onPointerDown"];
}) {
  const trigger = (
    <DropdownMenuTrigger asChild>
      <Button
        type="button"
        size={text === undefined ? "icon" : "sm"}
        variant="ghost"
        aria-label={label}
        onMouseDown={onMouseDown}
        onPointerDown={onPointerDown}
      >
        {text === undefined || icon === undefined ? icon : editorControlLabel(icon, text)}
      </Button>
    </DropdownMenuTrigger>
  );

  if (text !== undefined) {
    return trigger;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{trigger}</TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function keepMediaSelection(event: { preventDefault: () => void }): void {
  event.preventDefault();
}

type ScrollPoint = {
  node: HTMLElement;
  top: number;
  left: number;
};

function scrollableNodes(): HTMLElement[] {
  const found: HTMLElement[] = [];
  const seen = new Set<HTMLElement>();
  const add = (node: Element | null): void => {
    if (!(node instanceof HTMLElement) || seen.has(node)) {
      return;
    }
    seen.add(node);
    found.push(node);
  };

  add(document.querySelector("[data-block-viewport]"));
  const editor = document.querySelector("[data-slate-editor]");
  let parent = editor instanceof HTMLElement ? editor.parentElement : null;
  while (parent) {
    const style = getComputedStyle(parent);
    const overflows =
      parent.scrollHeight > parent.clientHeight + 1 || parent.scrollWidth > parent.clientWidth + 1;
    if (overflows && /(auto|scroll|overlay)/.test(`${style.overflowX}${style.overflowY}`)) {
      add(parent);
    }
    parent = parent.parentElement;
  }

  return found;
}

// Menus and popovers restore the caret with focus() and select(). A bare focus
// scrolls the editor element to the top of the viewport. Capture the scroll
// ports first, then put them back after Slate's selection effect.
export function retainScroll(run: () => void): void {
  const points: ScrollPoint[] = scrollableNodes().map((node) => ({
    node,
    top: node.scrollTop,
    left: node.scrollLeft,
  }));
  const x = window.scrollX;
  const y = window.scrollY;
  run();
  const apply = (): void => {
    for (const point of points) {
      point.node.scrollTop = point.top;
      point.node.scrollLeft = point.left;
    }
    window.scrollTo(x, y);
  };
  apply();
  queueMicrotask(apply);
  requestAnimationFrame(() => {
    apply();
    requestAnimationFrame(apply);
  });
}

export function focusEditorWithoutScroll(editorRoot: Element | null): void {
  if (editorRoot instanceof HTMLElement) {
    editorRoot.focus({ preventScroll: true });
  }
}

export function mediaStringAttr(element: TElement, key: string): string | undefined {
  const value: unknown = Reflect.get(element, key);
  return typeof value === "string" ? value : undefined;
}
