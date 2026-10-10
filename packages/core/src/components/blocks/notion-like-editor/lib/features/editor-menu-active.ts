// Active (current-value) menu item background. `bg-primary/10` is a filled
// tint that is visible on the popover in light and dark and distinct from the
// keyboard-highlight/hover token (`bg-accent`, which equals `bg-muted` here).
export const MENU_ITEM_ACTIVE = "bg-primary/10 text-foreground font-medium";

// Same tint for Radix radio/checkbox items, which expose `data-state="checked"`.
export const MENU_ITEM_ACTIVE_CHECKED =
  "data-[state=checked]:bg-primary/10 data-[state=checked]:text-foreground data-[state=checked]:font-medium";
