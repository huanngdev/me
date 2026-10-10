import type { ComponentProps, ReactNode } from "react";

import { ScrollArea, ScrollBar } from "@/components/scroll-area";
import { cn } from "@/lib/utils";

type ScrollFadeAreaProps = Omit<ComponentProps<typeof ScrollArea>, "children"> & {
  children: ReactNode;
  orientation?: "vertical" | "horizontal";
};

// The one scroll region for editor content: the app's shadcn ScrollArea with the
// scroll-fade mask on the element that actually scrolls (its viewport). No
// native `overflow-*-auto` class is left on the scrolling element, so the OS
// scrollbar never shows.
export function ScrollFadeArea({
  children,
  className,
  orientation = "vertical",
  ...props
}: ScrollFadeAreaProps) {
  return (
    <ScrollArea
      {...props}
      className={cn(
        // The viewport is the scroller. It inherits the root's max-height and
        // sizes to its content, so a max-height root scrolls instead of the
        // viewport overflowing it.
        "[&>[data-slot=scroll-area-viewport]]:h-auto [&>[data-slot=scroll-area-viewport]]:max-h-[inherit]",
        orientation === "horizontal"
          ? "[&>[data-slot=scroll-area-viewport]]:scroll-fade-x"
          : "[&>[data-slot=scroll-area-viewport]]:scroll-fade-y",
        className,
      )}
    >
      {children}
      {orientation === "horizontal" ? <ScrollBar orientation="horizontal" /> : null}
    </ScrollArea>
  );
}

// A dropdown menu's scroll region: capped by Radix's available-height variable
// and faded at the edge that has more content.
export function MenuScrollArea({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <ScrollFadeArea
      className={cn("max-h-[var(--radix-dropdown-menu-content-available-height)]", className)}
    >
      {children}
    </ScrollFadeArea>
  );
}
