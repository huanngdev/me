import {
  Ban,
  CircleCheck,
  CircleHelp,
  Flame,
  Info,
  Lightbulb,
  MessageCircle,
  NotebookPen,
  Pin,
  Star,
  Target,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { SlateElement, type SlateElementProps } from "platejs/static";

import type { CalloutIcon } from "../../lib/document/editor-document-schema";
import { LIST_SIBLING_GAP_CLASS } from "../elements/block-list-metrics";
import { CALLOUT_TONE_CLASS_NAME, calloutIcon, calloutTone } from "../elements/callout-classes";

const CALLOUT_ICON_CLASS = "size-5 text-muted-foreground";

const GLYPH: Record<CalloutIcon, LucideIcon> = {
  lightbulb: Lightbulb,
  info: Info,
  "circle-check": CircleCheck,
  "triangle-alert": TriangleAlert,
  ban: Ban,
  pin: Pin,
  "notebook-pen": NotebookPen,
  flame: Flame,
  "circle-help": CircleHelp,
  star: Star,
  target: Target,
  "message-circle": MessageCircle,
};

export function CalloutStatic(props: SlateElementProps) {
  const icon = calloutIcon(props.element.icon);
  const tone = calloutTone(props.element.variant);
  const Icon = GLYPH[icon];
  return (
    <SlateElement
      {...props}
      attributes={{ ...props.attributes, role: "note" }}
      className={`my-0 flex items-start gap-2 rounded-md border px-3 py-2 ${CALLOUT_TONE_CLASS_NAME[tone]}`}
    >
      <div className="flex h-[1lh] min-h-0 w-8 shrink-0 items-center justify-center overflow-visible select-none">
        <span className="inline-flex size-7 items-center justify-center text-base leading-none">
          <Icon aria-hidden="true" className={CALLOUT_ICON_CLASS} />
        </span>
      </div>
      <div className={`min-w-0 flex-1 space-y-2 ${LIST_SIBLING_GAP_CLASS}`}>{props.children}</div>
    </SlateElement>
  );
}
