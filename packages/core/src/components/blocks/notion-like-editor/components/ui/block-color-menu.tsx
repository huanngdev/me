import { useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Check, Palette } from "lucide-react";
import type { SlateEditor } from "platejs";
import { useEditorRef, useEditorSelector } from "platejs/react";

import {
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/dropdown-menu";
import { cn } from "@/lib/utils";

import { runEditorCommand } from "../../lib/commands/editor-commands";
import { PALETTE_TOKENS, type PaletteToken } from "../../lib/document/editor-document-schema";
import {
  blockToneAllowed,
  blockToneState,
  setBlockTone,
} from "../../lib/features/editor-block-tone";
import type { BlockToneKind } from "../../lib/features/editor-block-tone-style";
import { findBlockById } from "../../lib/features/editor-synced-block";
import { COLUMNS, moveSwatchFocus, tokenLabel } from "./selection-color-menu";

type ToneState = PaletteToken | null | "mixed";

// Capture phase, so it runs before Radix's roving focus on the items. Arrow keys walk the grid.
// ArrowLeft from the first column is left alone, so Radix closes the submenu.
function moveGridFocus(event: ReactKeyboardEvent<HTMLElement>): void {
  if (event.key === "ArrowLeft") {
    const swatches = Array.from(event.currentTarget.querySelectorAll("[data-color-swatch]"));
    const index = swatches.indexOf(document.activeElement as Element);
    if (index >= 0 && index % COLUMNS === 0) {
      return;
    }
  }
  moveSwatchFocus(event);
}

function pathsOf(editor: SlateEditor, ids: readonly string[]): number[][] {
  const paths: number[][] = [];
  for (const id of ids) {
    const located = findBlockById(editor, id);
    if (located) {
      paths.push([...located[1]]);
    }
  }
  return paths;
}

// The block menu's Color submenu. It shares the swatch look of the selection colour menu.
export function BlockColorMenu({ ids, onActed }: { ids: readonly string[]; onActed: () => void }) {
  const editor = useEditorRef();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const paths = pathsOf(editor, ids);
  const allowed = paths.some((path) => blockToneAllowed(editor, path));
  // Read from the document on every change, so the pressed state moves when a choice is applied.
  const textState = useEditorSelector(
    (current) => blockToneState(current, pathsOf(current, ids), "text"),
    [editor, ids],
  );
  const backgroundState = useEditorSelector(
    (current) => blockToneState(current, pathsOf(current, ids), "background"),
    [editor, ids],
  );
  const states: Record<BlockToneKind, ToneState> = {
    text: textState,
    background: backgroundState,
  };

  // The menu stays open after a choice, and the focused swatch stays mounted.
  function choose(kind: BlockToneKind, token: PaletteToken | null): void {
    onActed();
    if (states[kind] === token) {
      return;
    }
    runEditorCommand(editor, setBlockTone, { ids: [...ids], kind, token });
  }

  if (!allowed) {
    const reason =
      ids.length > 1
        ? "Color is not available for these blocks."
        : "Color is not available for this block.";
    return (
      <DropdownMenuItem disabled data-block-menu-color="">
        <Palette aria-hidden="true" />
        <span className="flex min-w-0 flex-col items-start">
          <span>Color</span>
          <span className="text-muted-foreground text-xs whitespace-normal">{reason}</span>
        </span>
      </DropdownMenuItem>
    );
  }

  return (
    <DropdownMenuSub open={open} onOpenChange={setOpen}>
      <DropdownMenuSubTrigger ref={triggerRef} data-block-menu-color="">
        <Palette aria-hidden="true" />
        Color
      </DropdownMenuSubTrigger>
      <DropdownMenuPortal>
        <DropdownMenuSubContent
          data-block-menu-portal=""
          data-block-color-menu=""
          collisionPadding={8}
          hideWhenDetached
          className="w-auto p-2"
          onKeyDownCapture={moveGridFocus}
          onEscapeKeyDown={(event) => {
            // Escape closes this submenu only. Radix would otherwise close the whole block menu.
            event.preventDefault();
            setOpen(false);
            triggerRef.current?.focus();
          }}
        >
          <ColorSection kind="text" state={states.text} onChoose={choose} />
          <ColorSection kind="background" state={states.background} onChoose={choose} />
        </DropdownMenuSubContent>
      </DropdownMenuPortal>
    </DropdownMenuSub>
  );
}

function ColorSection({
  kind,
  state,
  onChoose,
}: {
  kind: BlockToneKind;
  state: ToneState;
  onChoose: (kind: BlockToneKind, token: PaletteToken | null) => void;
}) {
  const name = kind === "text" ? "Text" : "Background";
  const label = state === "mixed" ? `${name} · Mixed` : name;

  return (
    <div role="group" aria-label={label} className="mb-2 grid grid-cols-5 gap-1 last:mb-0">
      <p className="text-muted-foreground col-span-5 text-xs">{label}</p>
      <Swatch kind={kind} token={null} pressed={state === null} onChoose={onChoose} />
      {PALETTE_TOKENS.map((token) => (
        <Swatch
          key={token}
          kind={kind}
          token={token}
          pressed={state === token}
          onChoose={onChoose}
        />
      ))}
    </div>
  );
}

// A menu item, not a button: Radix owns focus and Escape inside the submenu.
function Swatch({
  kind,
  token,
  pressed,
  onChoose,
}: {
  kind: BlockToneKind;
  token: PaletteToken | null;
  pressed: boolean;
  onChoose: (kind: BlockToneKind, token: PaletteToken | null) => void;
}) {
  const name = token === null ? "Default" : tokenLabel(token);
  const color = token === null ? undefined : `var(--editor-text-${token})`;
  const background = token === null ? undefined : `var(--editor-bg-${token})`;

  return (
    <DropdownMenuItem
      aria-label={`${name} ${kind}`}
      aria-pressed={pressed}
      data-color-swatch=""
      data-color-kind={kind}
      data-color-token={token ?? "default"}
      className={cn(
        "relative size-8 justify-center p-0",
        kind === "background" && token === null && "border-border border bg-transparent",
        pressed && "ring-ring ring-offset-popover ring-2 ring-offset-2",
      )}
      style={kind === "text" ? { color } : { backgroundColor: background }}
      onSelect={(event) => {
        // Radix closes the menu on select unless the event is prevented.
        event.preventDefault();
        onChoose(kind, token);
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
    </DropdownMenuItem>
  );
}
