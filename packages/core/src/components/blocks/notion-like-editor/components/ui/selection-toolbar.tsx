import { useEffect, useMemo, useState } from "react";
import {
  Bold,
  CaseSensitive,
  ChevronDown,
  Code,
  Ellipsis,
  IndentDecrease,
  IndentIncrease,
  Italic,
  Keyboard,
  Link,
  RemoveFormatting,
  Sigma,
  Strikethrough,
  Subscript,
  Superscript,
  Type,
  Underline,
  UnfoldVertical,
} from "lucide-react";
import { type SlateEditor, type TRange } from "platejs";
import { Button } from "@/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/dropdown-menu";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/popover";
import { Toggle } from "@/components/toggle";
import { cn } from "@/lib/utils";
import {
  clearFormatting,
  type EditorCommand,
  setFontFamily,
  setFontSize,
  setHighlight,
  setLineHeight,
  setTextAlign,
  setTextColor,
} from "../../lib/commands/editor-commands";
import { shortcutText, ariaKeyShortcuts } from "../../lib/features/editor-shortcuts";
import {
  FONT_FAMILIES,
  FONT_SIZES,
  LINE_HEIGHTS,
  type FontFamily,
  type FontSize,
  type LineHeight,
  type PaletteToken,
  type TextAlign,
} from "../../lib/document/editor-document-schema";
import { indentBlocks, outdentBlocks } from "../../lib/features/editor-block-indent";
import { blockPickerTurnItems, type BlockPickerItem } from "../../lib/features/editor-block-picker";
import { MENU_ITEM_ACTIVE_CHECKED } from "../../lib/features/editor-menu-active";
import {
  applyToolbarCommand,
  applyTurnInto,
  markCommand,
  selectionToolbarFrame,
  selectionToolbarModel,
  type SelectionToolbarMarkId,
} from "../../lib/features/editor-selection-toolbar";
import {
  editInlineLink,
  holdSelectionHighlight,
  insertInlineLink,
} from "../../lib/plugins/editor-link";
import { toggleInlineEquation } from "../../lib/plugins/editor-inline-equation-ui";
import { useSelectionToolbar } from "../../hooks/use-selection-toolbar";
import { anchorContext, rangeContextElement, rangeRect, virtualAnchor } from "./anchor-rect";
import { editorControlLabel, retainScroll } from "./block-toolbar";
import { BlockPickerGroups } from "./block-picker";
import { useShortcutPlatform } from "./editor-shortcut";
import { MenuScrollArea, ScrollFadeArea } from "./editor-scroll";
import { SelectionColorMenu } from "./selection-color-menu";
import { featureEnabled } from "../../lib/plugins/editor-config";
import {
  keepSelection,
  selectionDomRange,
  returnToEditor,
  ControlTip,
  ToolbarRoot,
  ToolbarSeparator,
  keepNested,
  firstControlId,
  tabOf,
} from "./selection-toolbar-parts";
import { ALIGN_ICON, AlignMenu } from "./selection-toolbar-align";
import { CheckItem, ChoiceMenu, DefaultRadio, choiceValue } from "./selection-toolbar-choice";

const MARK_ICONS = {
  bold: Bold,
  italic: Italic,
  underline: Underline,
  strikethrough: Strikethrough,
  code: Code,
} as const;
const FONT_LABEL: Record<(typeof FONT_FAMILIES)[number], string> = {
  sans: "Sans",
  serif: "Serif",
  mono: "Mono",
};
export function SelectionToolbar() {
  "use no memo";

  const toolbar = useSelectionToolbar();
  const { editor, side, visible, dismiss, captureRange, setMenuOpen } = toolbar;
  const [revision, setRevision] = useState(0);
  const anchor = useMemo(
    () =>
      virtualAnchor(
        () => rangeRect(selectionDomRange(editor)),
        () => anchorContext(rangeContextElement(selectionDomRange(editor))),
      ),
    [editor],
  );

  useEffect(() => {
    if (!visible) {
      return;
    }
    window.dispatchEvent(new Event("resize"));
  }, [toolbar.expandedKey, visible]);

  useEffect(() => {
    if (!visible) {
      return;
    }

    const onKey = (event: KeyboardEvent): void => {
      const active = document.activeElement;
      const inToolbar =
        active instanceof Element &&
        active.closest("[data-selection-toolbar], [data-selection-toolbar-portal]") !== null;
      if (
        event.altKey &&
        event.key === "F10" &&
        !event.shiftKey &&
        !event.metaKey &&
        !event.ctrlKey
      ) {
        if (inToolbar) {
          return;
        }
        event.preventDefault();
        document
          .querySelector<HTMLElement>(
            "[data-selection-toolbar] [data-toolbar-control]:not([disabled])",
          )
          ?.focus();
        return;
      }

      if (event.key === "Escape" && !inToolbar) {
        const inEditor =
          active instanceof Element && active.closest("[data-slate-editor]") !== null;
        if (inEditor) {
          event.preventDefault();
          dismiss();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
    };
  }, [dismiss, visible]);

  if (!visible) {
    return null;
  }

  const model = selectionToolbarModel(editor);
  void revision;
  const range = (): TRange | null => toolbar.savedRange() ?? editor.selection;

  function run<Payload>(command: EditorCommand<Payload>, payload: Payload): void {
    const saved = range();
    if (!saved) {
      return;
    }
    retainScroll(() => {
      applyToolbarCommand(editor, command, payload, saved);
      returnToEditor(editor, editor.selection);
    });
    setRevision((value) => value + 1);
  }

  function onMenu(open: boolean): void {
    if (open) {
      captureRange();
    }
    setMenuOpen(open);
  }

  function onToolbarKeyDown(event: React.KeyboardEvent<HTMLElement>): void {
    const items = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>("[data-toolbar-control]:not([disabled])"),
    );
    const index = items.indexOf(document.activeElement as HTMLElement);
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      if (index < 0 || items.length === 0) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const delta = event.key === "ArrowRight" ? 1 : -1;
      items[(index + delta + items.length) % items.length]?.focus();
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      event.stopPropagation();
      (event.key === "Home" ? items[0] : items[items.length - 1])?.focus();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      returnToEditor(editor, range());
    }
  }

  const controls = (
    <ToolbarControls
      editor={editor}
      onMenu={onMenu}
      onMark={(id) => {
        run(markCommand(id), undefined);
      }}
      onLink={() => {
        run(model.link.editing ? editInlineLink : insertInlineLink, undefined);
      }}
      onEquation={() => {
        run(toggleInlineEquation, undefined);
      }}
      onTextColor={(token) => {
        const saved = range();
        if (!saved) {
          return;
        }
        retainScroll(() => {
          applyToolbarCommand(editor, setTextColor, token, saved);
        });
        captureRange();
        holdSelectionHighlight(editor, toolbar.savedRange());
        setRevision((value) => value + 1);
      }}
      onHighlight={(token) => {
        const saved = range();
        if (!saved) {
          return;
        }
        retainScroll(() => {
          applyToolbarCommand(editor, setHighlight, token, saved);
        });
        captureRange();
        holdSelectionHighlight(editor, toolbar.savedRange());
        setRevision((value) => value + 1);
      }}
      onTurn={(item) => {
        const saved = range();
        const target = selectionToolbarModel(editor).turnInto;
        const kind = item.kind;
        if (!saved || !target || kind === undefined) {
          return;
        }
        retainScroll(() => {
          applyTurnInto(editor, target.path, kind, saved);
          returnToEditor(editor, editor.selection);
        });
        setRevision((value) => value + 1);
      }}
      onSuperscript={() => {
        run(markCommand("superscript"), undefined);
      }}
      onSubscript={() => {
        run(markCommand("subscript"), undefined);
      }}
      onKeyboard={() => {
        run(markCommand("keyboard"), undefined);
      }}
      onAlign={(value) => {
        run(setTextAlign, value);
      }}
      onRestore={() => {
        returnToEditor(editor, range());
      }}
      onFontSize={(value) => {
        run(setFontSize, value);
      }}
      onFontFamily={(value) => {
        run(setFontFamily, value);
      }}
      onLineHeight={(value) => {
        run(setLineHeight, value);
      }}
      onIndent={() => {
        run(indentBlocks, undefined);
      }}
      onOutdent={() => {
        run(outdentBlocks, undefined);
      }}
      onClear={() => {
        run(clearFormatting, undefined);
      }}
    />
  );

  const frame = selectionToolbarFrame(document);
  return (
    <Popover open modal={false}>
      <PopoverAnchor virtualRef={anchor} />
      <PopoverContent
        data-collision-boundary={frame ? "frame" : undefined}
        aria-label="Text formatting"
        side={side}
        align="center"
        sideOffset={8}
        collisionPadding={8}
        hideWhenDetached
        {...(frame ? { collisionBoundary: frame } : {})}
        onOpenAutoFocus={keepSelection}
        onCloseAutoFocus={keepSelection}
        onInteractOutside={keepNested}
        onFocusOutside={keepNested}
        onPointerDownOutside={keepNested}
        onMouseDown={keepSelection}
        onKeyDown={onToolbarKeyDown}
        className="w-auto max-w-[min(calc(100vw-16px),var(--radix-popover-content-available-width))] p-1"
      >
        <ScrollFadeArea orientation="horizontal" className="w-full">
          <ToolbarRoot collisionBoundary={frame ? "frame" : undefined}>{controls}</ToolbarRoot>
        </ScrollFadeArea>
      </PopoverContent>
    </Popover>
  );
}
function ToolbarControls({
  editor,
  onMenu,
  onMark,
  onLink,
  onEquation,
  onTextColor,
  onHighlight,
  onTurn,
  onSuperscript,
  onSubscript,
  onKeyboard,
  onAlign,
  onFontSize,
  onFontFamily,
  onLineHeight,
  onIndent,
  onOutdent,
  onClear,
  onRestore,
}: {
  editor: SlateEditor;
  onMenu: (open: boolean) => void;
  onMark: (id: SelectionToolbarMarkId) => void;
  onLink: () => void;
  onEquation: () => void;
  onTextColor: (token: PaletteToken | null) => void;
  onHighlight: (token: PaletteToken | null) => void;
  onTurn: (item: BlockPickerItem) => void;
  onSuperscript: () => void;
  onSubscript: () => void;
  onKeyboard: () => void;
  onAlign: (value: TextAlign | null) => void;
  onRestore: () => void;
  onFontSize: (value: FontSize | null) => void;
  onFontFamily: (value: FontFamily | null) => void;
  onLineHeight: (value: LineHeight | null) => void;
  onIndent: () => void;
  onOutdent: () => void;
  onClear: () => void;
}) {
  const model = selectionToolbarModel(editor);
  const platform = useShortcutPlatform();
  const turnItems = model.turnInto ? blockPickerTurnItems(editor, model.turnInto.path) : [];
  const currentTurn = turnItems.find((item) => item.checked);
  const TurnIcon = currentTurn?.icon ?? Type;
  const firstEnabled = firstControlId(model.turnInto !== null, model);

  const alignIconKey = model.align === "mixed" || model.align === null ? "left" : model.align;
  const AlignIcon = ALIGN_ICON[alignIconKey];

  return (
    <>
      {model.turnInto ? (
        <DropdownMenu modal={false} onOpenChange={onMenu}>
          <ControlTip label="Turn into">
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                aria-label={`Turn into, current: ${model.turnInto.label}`}
                data-toolbar-control="turn-into"
                tabIndex={tabOf("turn-into", false, firstEnabled)}
                className="h-8"
                onMouseDown={(event) => {
                  keepSelection(event);
                }}
              >
                {editorControlLabel(<TurnIcon aria-hidden="true" />, model.turnInto.label)}
                <ChevronDown aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
          </ControlTip>
          <DropdownMenuContent
            data-selection-toolbar-portal=""
            collisionPadding={8}
            hideWhenDetached
            className="w-64 overflow-hidden"
            onCloseAutoFocus={(event) => {
              keepSelection(event);
              onRestore();
            }}
          >
            <MenuScrollArea>
              <BlockPickerGroups
                items={turnItems}
                value={model.turnInto.currentId}
                radio
                shortcuts
                onChoose={onTurn}
              />
            </MenuScrollArea>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
      {model.turnInto ? <ToolbarSeparator /> : null}
      {model.marks.map((mark) => {
        const Icon = MARK_ICONS[mark.id as SelectionToolbarMarkId];
        return (
          <ControlTip
            key={mark.id}
            label={mark.label}
            shortcut={mark.shortcut}
            reason={mark.reason}
            disabled={mark.disabled}
          >
            <Toggle
              size="sm"
              variant="default"
              pressed={mark.pressed}
              aria-pressed={mark.mixed ? "mixed" : mark.pressed}
              aria-label={mark.label}
              disabled={mark.disabled}
              data-toolbar-control={mark.id}
              aria-keyshortcuts={
                mark.shortcut !== undefined && platform !== null
                  ? ariaKeyShortcuts(mark.shortcut, platform)
                  : undefined
              }
              data-state-mixed={mark.mixed ? "" : undefined}
              tabIndex={tabOf(mark.id, mark.disabled, firstEnabled)}
              className="size-8 px-0 disabled:pointer-events-auto"
              onMouseDown={keepSelection}
              onPressedChange={() => {
                onMark(mark.id as SelectionToolbarMarkId);
              }}
            >
              <Icon aria-hidden="true" />
            </Toggle>
          </ControlTip>
        );
      })}
      <ToolbarSeparator />
      <ControlTip
        label="Link"
        shortcut={model.link.shortcut}
        reason={model.link.reason}
        disabled={model.link.disabled}
      >
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label="Link"
          aria-pressed={model.link.pressed}
          disabled={model.link.disabled}
          data-toolbar-control="link"
          aria-keyshortcuts={platform !== null ? ariaKeyShortcuts("link", platform) : undefined}
          data-state={model.link.pressed ? "on" : "off"}
          tabIndex={tabOf("link", model.link.disabled, firstEnabled)}
          className={cn("disabled:pointer-events-auto", model.link.pressed && "bg-muted")}
          onMouseDown={keepSelection}
          onClick={onLink}
        >
          <Link aria-hidden="true" />
        </Button>
      </ControlTip>
      {featureEnabled(editor, "equations") ? (
        <ControlTip
          label="Equation"
          shortcut={model.equation.shortcut}
          reason={model.equation.reason}
          disabled={model.equation.disabled}
        >
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label="Equation"
            disabled={model.equation.disabled}
            data-toolbar-control="equation"
            aria-keyshortcuts={
              platform !== null ? ariaKeyShortcuts("inlineEquation", platform) : undefined
            }
            tabIndex={tabOf("equation", model.equation.disabled, firstEnabled)}
            className="disabled:pointer-events-auto"
            onMouseDown={keepSelection}
            onClick={onEquation}
          >
            <Sigma aria-hidden="true" />
          </Button>
        </ControlTip>
      ) : null}
      <ToolbarSeparator />
      <AlignMenu
        model={model}
        icon={<AlignIcon aria-hidden="true" />}
        firstEnabled={firstEnabled}
        onOpenChange={onMenu}
        onAlign={onAlign}
        onRestore={onRestore}
      />
      <ToolbarSeparator />
      <SelectionColorMenu
        textColor={model.textColor}
        highlight={model.highlight}
        disabled={model.colorDisabled}
        tabIndex={tabOf("color", model.colorDisabled, firstEnabled)}
        onTextColor={onTextColor}
        onHighlight={onHighlight}
        onOpenChange={onMenu}
        onRestore={onRestore}
      />
      <ToolbarSeparator />
      <MoreMenu
        model={model}
        firstEnabled={firstEnabled}
        onOpenChange={onMenu}
        onSuperscript={onSuperscript}
        onSubscript={onSubscript}
        onKeyboard={onKeyboard}
        onFontSize={onFontSize}
        onFontFamily={onFontFamily}
        onLineHeight={onLineHeight}
        onIndent={onIndent}
        onOutdent={onOutdent}
        onClear={onClear}
      />
    </>
  );
}
function MoreMenu({
  model,
  firstEnabled,
  onOpenChange,
  onSuperscript,
  onSubscript,
  onKeyboard,
  onFontSize,
  onFontFamily,
  onLineHeight,
  onIndent,
  onOutdent,
  onClear,
}: {
  model: ReturnType<typeof selectionToolbarModel>;
  firstEnabled: string;
  onOpenChange: (open: boolean) => void;
  onSuperscript: () => void;
  onSubscript: () => void;
  onKeyboard: () => void;
  onFontSize: (value: FontSize | null) => void;
  onFontFamily: (value: FontFamily | null) => void;
  onLineHeight: (value: LineHeight | null) => void;
  onIndent: () => void;
  onOutdent: () => void;
  onClear: () => void;
}) {
  const platform = useShortcutPlatform();
  return (
    <DropdownMenu modal={false} onOpenChange={onOpenChange}>
      <ControlTip label="More">
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label="More"
            data-toolbar-control="more"
            tabIndex={tabOf("more", false, firstEnabled)}
            onMouseDown={keepSelection}
          >
            <Ellipsis aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
      </ControlTip>
      <DropdownMenuContent
        data-selection-toolbar-portal=""
        data-selection-more=""
        collisionPadding={8}
        hideWhenDetached
        className="w-56 overflow-hidden"
        onCloseAutoFocus={keepSelection}
      >
        <MenuScrollArea>
          <CheckItem
            mark={model.superscript}
            icon={<Superscript aria-hidden="true" />}
            onToggle={onSuperscript}
          />
          <CheckItem
            mark={model.subscript}
            icon={<Subscript aria-hidden="true" />}
            onToggle={onSubscript}
          />
          <CheckItem
            mark={model.keyboard}
            icon={<Keyboard aria-hidden="true" />}
            onToggle={onKeyboard}
          />
          <ChoiceMenu
            label="Font size"
            icon={<CaseSensitive aria-hidden="true" />}
            value={choiceValue(model.fontSize)}
          >
            <DefaultRadio onSelect={() => onFontSize(null)} />
            {FONT_SIZES.map((size) => (
              <DropdownMenuRadioItem
                key={size}
                value={size}
                className={MENU_ITEM_ACTIVE_CHECKED}
                data-more-choice={`font-size-${size}`}
                onSelect={() => {
                  onFontSize(size);
                }}
              >
                {size}
              </DropdownMenuRadioItem>
            ))}
          </ChoiceMenu>
          <ChoiceMenu
            label="Font"
            icon={<Type aria-hidden="true" />}
            value={choiceValue(model.fontFamily)}
          >
            <DefaultRadio onSelect={() => onFontFamily(null)} />
            {FONT_FAMILIES.map((family) => (
              <DropdownMenuRadioItem
                key={family}
                value={family}
                className={MENU_ITEM_ACTIVE_CHECKED}
                data-more-choice={`font-${family}`}
                onSelect={() => {
                  onFontFamily(family);
                }}
              >
                {FONT_LABEL[family]}
              </DropdownMenuRadioItem>
            ))}
          </ChoiceMenu>
          <ChoiceMenu
            label="Line height"
            icon={<UnfoldVertical aria-hidden="true" />}
            value={choiceValue(model.lineHeight)}
          >
            <DefaultRadio onSelect={() => onLineHeight(null)} />
            {LINE_HEIGHTS.map((height) => (
              <DropdownMenuRadioItem
                key={height}
                value={String(height)}
                className={MENU_ITEM_ACTIVE_CHECKED}
                data-more-choice={`line-height-${height}`}
                onSelect={() => {
                  onLineHeight(height);
                }}
              >
                {String(height)}
              </DropdownMenuRadioItem>
            ))}
          </ChoiceMenu>
          <DropdownMenuItem
            disabled={model.indent.disabled}
            data-more-choice="indent"
            onSelect={onIndent}
          >
            <IndentIncrease aria-hidden="true" />
            <span className="flex min-w-0 flex-col items-start">
              <span>Indent</span>
              {model.indent.reason ? (
                <span className="text-muted-foreground text-xs whitespace-normal">
                  {model.indent.reason}
                </span>
              ) : null}
            </span>
            {platform !== null && model.indent.shortcut ? (
              <DropdownMenuShortcut>
                {shortcutText(model.indent.shortcut, platform)}
              </DropdownMenuShortcut>
            ) : null}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={model.outdent.disabled}
            data-more-choice="outdent"
            onSelect={onOutdent}
          >
            <IndentDecrease aria-hidden="true" />
            <span className="flex min-w-0 flex-col items-start">
              <span>Outdent</span>
              {model.outdent.reason ? (
                <span className="text-muted-foreground text-xs whitespace-normal">
                  {model.outdent.reason}
                </span>
              ) : null}
            </span>
            {platform !== null && model.outdent.shortcut ? (
              <DropdownMenuShortcut>
                {shortcutText(model.outdent.shortcut, platform)}
              </DropdownMenuShortcut>
            ) : null}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={model.clear.disabled}
            data-more-choice="clear"
            onSelect={onClear}
          >
            <RemoveFormatting aria-hidden="true" />
            <span className="flex min-w-0 flex-col items-start">
              <span>Clear formatting</span>
              {model.clear.reason ? (
                <span className="text-muted-foreground text-xs whitespace-normal">
                  {model.clear.reason}
                </span>
              ) : null}
            </span>
            {platform !== null && model.clear.shortcut ? (
              <DropdownMenuShortcut>
                {shortcutText(model.clear.shortcut, platform)}
              </DropdownMenuShortcut>
            ) : null}
          </DropdownMenuItem>
        </MenuScrollArea>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
