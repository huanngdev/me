import {
  CALLOUT_DEFAULT_ICON,
  CALLOUT_ICONS,
  CALLOUT_TONES,
  type CalloutIcon,
  type CalloutTone,
} from "../../lib/document/editor-document-schema";

export const CALLOUT_TONE_CLASS_NAME = {
  default: "border-editor-callout-default-border bg-editor-callout-default-bg text-foreground",
  info: "border-editor-callout-info-border bg-editor-callout-info-bg text-foreground",
  success: "border-editor-callout-success-border bg-editor-callout-success-bg text-foreground",
  warning: "border-editor-callout-warning-border bg-editor-callout-warning-bg text-foreground",
  danger: "border-editor-callout-danger-border bg-editor-callout-danger-bg text-foreground",
} as const;

export function calloutIcon(value: unknown): CalloutIcon {
  const found = CALLOUT_ICONS.find((icon) => icon === value);
  return found ?? CALLOUT_DEFAULT_ICON;
}

export function calloutTone(value: unknown): "default" | CalloutTone {
  const found = CALLOUT_TONES.find((tone) => tone === value);
  return found ?? "default";
}
