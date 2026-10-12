import { useState, type CSSProperties } from "react";
import { Baseline, Check } from "lucide-react";

import { Button } from "@/components/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/tooltip";
import { cn } from "@/lib/utils";

import { PALETTE_TOKENS, type PaletteToken } from "../../lib/document/editor-document-schema";
import type { HighlightState, TextColorState } from "../../lib/commands/editor-commands";
export const COLUMNS = 5;

export function tokenLabel(token: string): string {
  return token.charAt(0).toUpperCase() + token.slice(1);
}

export function colorControlLabel(
  textColor: PaletteToken | null | "mixed",
  highlight: PaletteToken | null | "mixed",
): string {
  if (textColor === "mixed" || highlight === "mixed") {
    return "Color: mixed";
  }
  if (textColor === null && highlight === null) {
    return "Color: Default";
  }

  const parts: string[] = [];
  if (textColor) {
    parts.push(`${tokenLabel(textColor)} text`);
  }
  if (highlight) {
    parts.push(`${tokenLabel(highlight)} highlight`);
  }

  return `Color: ${parts.join(", ")}`;
}

function colorControlStyle(
  textColor: PaletteToken | null | "mixed",
  highlight: PaletteToken | null | "mixed",
): CSSProperties {
  const style: CSSProperties = {};
  if (textColor && textColor !== "mixed") {
    style.color = `var(--editor-text-${textColor})`;
  }
  if (highlight && highlight !== "mixed") {
    style.backgroundColor = `var(--editor-bg-${highlight})`;
  }

  return style;
}

function keepSelection(event: { preventDefault: () => void }): void {
  event.preventDefault();
}

export function SelectionColorMenu({
  textColor,
  highlight,
  disabled,
  reason,
  tabIndex,
  onTextColor,
  onHighlight,
  onOpenChange,
  onRestore,
}: {
  textColor: TextColorState;
  highlight: HighlightState;
  disabled: boolean;
  reason?: string;
  tabIndex?: number;
  onTextColor: (token: PaletteToken | null) => void;
  onHighlight: (token: PaletteToken | null) => void;
  onOpenChange: (open: boolean) => void;
  onRestore?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const summary = colorControlLabel(textColor, highlight);

  function setOpenState(next: boolean): void {
    setOpen(next);
    onOpenChange(next);
  }

  return (
    <Popover open={open} onOpenChange={setOpenState} modal={false}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              type="button"
              size="icon"
              variant="outline"
              aria-label="Color"
              disabled={disabled}
              tabIndex={tabIndex}
              data-toolbar-control="color"
              data-color-summary={summary}
              className="disabled:pointer-events-auto"
              style={colorControlStyle(textColor, highlight)}
              onMouseDown={keepSelection}
            >
              <Baseline aria-hidden="true" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>{disabled && reason ? reason : summary}</TooltipContent>
      </Tooltip>
      <PopoverContent
        data-selection-toolbar-portal=""
        data-selection-color-menu=""
        side="bottom"
        align="start"
        sideOffset={8}
        collisionPadding={8}
        hideWhenDetached
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          const content = event.currentTarget;
          if (!(content instanceof HTMLElement)) {
            return;
          }
          const first = content.querySelector("[data-color-swatch]");
          if (first instanceof HTMLElement) {
            first.focus();
          }
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          onRestore?.();
        }}
        onKeyDown={moveSwatchFocus}
        className="w-auto gap-2 p-2"
      >
        <SwatchSection label="Text color" kind="text" current={textColor} onChoose={onTextColor} />
        <SwatchSection
          label="Highlight"
          kind="highlight"
          current={highlight}
          onChoose={onHighlight}
        />
      </PopoverContent>
    </Popover>
  );
}

function SwatchSection({
  label,
  kind,
  current,
  onChoose,
}: {
  label: string;
  kind: "text" | "highlight";
  current: PaletteToken | null | "mixed";
  onChoose: (token: PaletteToken | null) => void;
}) {
  return (
    <div role="group" aria-label={label} className="grid grid-cols-5 gap-1">
      <p className="text-muted-foreground col-span-5 text-xs">{label}</p>
      <Swatch
        label={kind === "text" ? "Default text color" : "Default highlight"}
        pressed={current === null}
        kind={kind}
        token={null}
        onChoose={onChoose}
      />
      {PALETTE_TOKENS.map((token) => (
        <Swatch
          key={token}
          label={kind === "text" ? `${tokenLabel(token)} text` : `${tokenLabel(token)} highlight`}
          pressed={current === token}
          kind={kind}
          token={token}
          onChoose={onChoose}
        />
      ))}
    </div>
  );
}

function Swatch({
  label,
  pressed,
  kind,
  token,
  onChoose,
}: {
  label: string;
  pressed: boolean;
  kind: "text" | "highlight";
  token: PaletteToken | null;
  onChoose: (token: PaletteToken | null) => void;
}) {
  const color = token === null ? undefined : `var(--editor-text-${token})`;
  const background = token === null ? undefined : `var(--editor-bg-${token})`;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label={label}
            aria-pressed={pressed}
            data-color-swatch=""
            data-color-kind={kind}
            data-color-token={token ?? "default"}
            className={cn(
              "relative",
              kind === "highlight" && token === null && "border-border border bg-transparent",
              pressed && "ring-ring ring-offset-popover ring-2 ring-offset-2",
            )}
            style={kind === "text" ? { color } : { backgroundColor: background }}
            onMouseDown={keepSelection}
            onClick={() => {
              onChoose(token);
            }}
          >
            A
            {pressed ? (
              <Check
                aria-hidden="true"
                data-color-check=""
                className="absolute top-0.5 right-0.5 size-2.5"
              />
            ) : null}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function moveSwatchFocus(event: React.KeyboardEvent<HTMLElement>): void {
  if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
    return;
  }

  const buttons = Array.from(
    event.currentTarget.querySelectorAll<HTMLElement>("[data-color-swatch]"),
  );
  const index = buttons.indexOf(document.activeElement as HTMLElement);
  if (index < 0) {
    return;
  }

  event.preventDefault();
  const delta =
    event.key === "ArrowRight"
      ? 1
      : event.key === "ArrowLeft"
        ? -1
        : event.key === "ArrowDown"
          ? COLUMNS
          : -COLUMNS;
  const next = buttons[index + delta];
  next?.focus();
}
