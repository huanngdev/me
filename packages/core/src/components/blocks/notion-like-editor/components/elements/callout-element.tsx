import { useRef } from "react";
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
import {
  PlateElement,
  useEditorRef,
  useElement,
  useReadOnly,
  type PlateElementProps,
} from "platejs/react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/dropdown-menu";
import { cn } from "@/lib/utils";

import { LIST_SIBLING_GAP_CLASS } from "./block-list";
import {
  resetCallout,
  runEditorCommand,
  setCalloutIcon,
  setCalloutTone,
} from "../../lib/commands/editor-commands";
import {
  CALLOUT_DEFAULT_ICON,
  CALLOUT_ICONS,
  CALLOUT_TONES,
  type CalloutIcon,
  type CalloutTone,
} from "../../lib/document/editor-document-schema";

// role="note" is an ancillary note. An aside would be a complementary landmark.
// AGENTS.md keeps the accent for active states. The fill is the tone surface.
export const CALLOUT_TONE_CLASS_NAME = {
  default: "border-editor-callout-default-border bg-editor-callout-default-bg text-foreground",
  info: "border-editor-callout-info-border bg-editor-callout-info-bg text-foreground",
  success: "border-editor-callout-success-border bg-editor-callout-success-bg text-foreground",
  warning: "border-editor-callout-warning-border bg-editor-callout-warning-bg text-foreground",
  danger: "border-editor-callout-danger-border bg-editor-callout-danger-bg text-foreground",
} as const;

const TONE_LABEL = {
  default: "Default",
  info: "Info",
  success: "Success",
  warning: "Warning",
  danger: "Danger",
} as const;

// The size-7 box aligns with the 26px first line. The glyph is 1.25× the 16px text.
const CALLOUT_ICON_CLASS = "size-5 text-muted-foreground";

const CALLOUT_ICON_GLYPH = {
  lightbulb: { label: "Lightbulb", Icon: Lightbulb },
  info: { label: "Info", Icon: Info },
  "circle-check": { label: "Circle check", Icon: CircleCheck },
  "triangle-alert": { label: "Triangle alert", Icon: TriangleAlert },
  ban: { label: "Ban", Icon: Ban },
  pin: { label: "Pin", Icon: Pin },
  "notebook-pen": { label: "Notebook pen", Icon: NotebookPen },
  flame: { label: "Flame", Icon: Flame },
  "circle-help": { label: "Circle help", Icon: CircleHelp },
  star: { label: "Star", Icon: Star },
  target: { label: "Target", Icon: Target },
  "message-circle": { label: "Message circle", Icon: MessageCircle },
} as const satisfies Record<CalloutIcon, { label: string; Icon: LucideIcon }>;

function CalloutIconGlyph({ icon }: { icon: CalloutIcon }) {
  const { Icon } = CALLOUT_ICON_GLYPH[icon];

  return <Icon aria-hidden="true" className={CALLOUT_ICON_CLASS} />;
}

export function calloutIcon(value: unknown): CalloutIcon {
  const found = CALLOUT_ICONS.find((icon) => icon === value);
  return found ?? CALLOUT_DEFAULT_ICON;
}

export function calloutTone(value: unknown): "default" | CalloutTone {
  const found = CALLOUT_TONES.find((tone) => tone === value);
  return found ?? "default";
}

function elementAttr(element: object, key: string): unknown {
  if (!(key in element)) {
    return undefined;
  }

  return Reflect.get(element, key);
}

const TONE_CHOICES = ["default", ...CALLOUT_TONES] as const;

// mousedown would move the editor selection onto the button. Cancelling it leaves
// the caret where it was. pointerdown stays untouched: Radix opens the menu there,
// and its own handler cancels that event so the button does not take focus.
function keepEditorSelection(event: { preventDefault: () => void }): void {
  event.preventDefault();
}

export function CalloutElement(props: PlateElementProps) {
  const editor = useEditorRef();
  const element = useElement();
  const readOnly = useReadOnly();
  const icon = calloutIcon(elementAttr(element, "icon"));
  const tone = calloutTone(elementAttr(element, "variant"));
  const path = editor.api.findPath(element);
  const savedSelection = useRef(editor.selection);

  return (
    <PlateElement
      {...props}
      attributes={{ ...props.attributes, role: "note" }}
      className={cn(
        "my-0 flex items-start gap-2 rounded-md border px-3 py-2",
        CALLOUT_TONE_CLASS_NAME[tone],
      )}
    >
      <div className="shrink-0 select-none" contentEditable={false}>
        {readOnly || !path ? (
          <span
            aria-hidden="true"
            className="inline-flex size-7 items-center justify-center text-base leading-none"
          >
            <CalloutIconGlyph icon={icon} />
          </span>
        ) : (
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger
              aria-label="Change callout icon and color"
              className="hover:bg-foreground/5 inline-flex size-7 items-center justify-center rounded-md text-base leading-none"
              onMouseDown={keepEditorSelection}
              onPointerDown={() => {
                savedSelection.current = editor.selection;
              }}
            >
              <CalloutIconGlyph icon={icon} />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="w-64"
              onCloseAutoFocus={(event) => {
                // Radix would focus the trigger here, which drops the text selection.
                event.preventDefault();
                const selection = savedSelection.current;
                editor.tf.withoutSaving(() => {
                  editor.tf.focus();
                  if (selection) {
                    editor.tf.select(selection);
                  }
                });
              }}
            >
              <DropdownMenuGroup className="grid grid-cols-6 gap-1">
                {CALLOUT_ICONS.map((choice) => (
                  <DropdownMenuItem
                    key={choice}
                    aria-label={CALLOUT_ICON_GLYPH[choice].label}
                    className="justify-center px-0"
                    onMouseDown={keepEditorSelection}
                    onSelect={() => {
                      runEditorCommand(editor, setCalloutIcon, { value: choice, at: path });
                    }}
                  >
                    <CalloutIconGlyph icon={choice} />
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              {TONE_CHOICES.map((choice) => (
                <DropdownMenuItem
                  key={choice}
                  onMouseDown={keepEditorSelection}
                  onSelect={() => {
                    runEditorCommand(editor, setCalloutTone, {
                      value: choice === "default" ? null : choice,
                      at: path,
                    });
                  }}
                >
                  <span
                    aria-hidden="true"
                    className={cn("size-3 rounded-sm border", CALLOUT_TONE_CLASS_NAME[choice])}
                  />
                  {TONE_LABEL[choice]}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onMouseDown={keepEditorSelection}
                onSelect={() => {
                  resetCallout(editor, path);
                }}
              >
                Reset
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      <div className={cn("min-w-0 flex-1 space-y-2", LIST_SIBLING_GAP_CLASS)}>{props.children}</div>
    </PlateElement>
  );
}
