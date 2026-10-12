import { cn } from "@/lib/utils";

import { LIST_SIBLING_GAP_CLASS } from "./block-list-metrics";

export const TOGGLE_HIDDEN_CONTENT_CLASS =
  "data-[open=false]:[&>:not(:first-child):not([contenteditable=false])]:hidden";

export const TOGGLE_LABEL_MARGIN_CLASS = "[&_h1]:mt-0 [&_h2]:mt-0 [&_h3]:mt-0";

export const TOGGLE_CLASS_NAME = cn(
  "space-y-2 [&>:not(:first-child)]:pl-9",
  LIST_SIBLING_GAP_CLASS,
  TOGGLE_HIDDEN_CONTENT_CLASS,
  TOGGLE_LABEL_MARGIN_CLASS,
);
