import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import {
  ArrowDown,
  ArrowRightLeft,
  ArrowUp,
  ChevronRight,
  Code,
  Copy,
  Heading1,
  Heading2,
  Heading3,
  Lightbulb,
  List,
  ListOrdered,
  ListTodo,
  TextQuote,
  Trash2,
  Type,
} from "lucide-react";
import { ElementApi, KEYS, RangeApi, type SlateEditor } from "platejs";
import { useEditorRef } from "platejs/react";

import { Button } from "@/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/tooltip";

import {
  deleteBlock,
  duplicateBlock,
  moveBlock,
  runEditorCommand,
  turnBlockInto,
} from "../../lib/commands/editor-commands";
import {
  settleMovedBlock,
  siblingMove,
  captureEditorScroll,
} from "../../lib/features/editor-block-drop";
import {
  blockHandleTarget,
  chainFromDom,
  targetBlockAtPath,
  type BlockHandleHit,
} from "../../lib/features/editor-block-handle";
import {
  BLOCK_MENU_KINDS,
  blockMenuDecisions,
  currentBlockMenuKind,
  isBlockMenuShortcut,
  keepNativeContextMenu,
  menuBlockView,
  type BlockMenuKind,
  type NativeMenuProbe,
} from "../../lib/features/editor-block-menu";
import { findBlockById } from "../../lib/features/editor-synced-block";
import { retainScroll } from "./block-toolbar";

type AnchorBox = {
  top: number;
  left: number;
  width: number;
  height: number;
};

type MenuSession = {
  target: BlockHandleHit;
  anchor: AnchorBox;
};

const TURN_ICONS = {
  paragraph: Type,
  h1: Heading1,
  h2: Heading2,
  h3: Heading3,
  bulleted: List,
  numbered: ListOrdered,
  todo: ListTodo,
  toggle: ChevronRight,
  "toggle-h1": Heading1,
  "toggle-h2": Heading2,
  "toggle-h3": Heading3,
  quote: TextQuote,
  callout: Lightbulb,
  code: Code,
} as const satisfies Record<BlockMenuKind, typeof Type>;

const CONTROL_SELECTOR =
  "button, input, textarea, select, [role='menu'], [role='menuitem'], [data-block-handle], [data-block-menu]";

const PAGE_CONTROL_SELECTOR =
  "a, button, input, textarea, select, summary, [role='tab'], [role='button']";

function cloneRange(selection: SlateEditor["selection"]) {
  if (!selection) {
    return null;
  }
  return {
    anchor: { path: [...selection.anchor.path], offset: selection.anchor.offset },
    focus: { path: [...selection.focus.path], offset: selection.focus.offset },
  };
}

function editableOf(editor: SlateEditor): HTMLElement | null {
  const first = editor.children[0];
  if (!first || !ElementApi.isElement(first)) {
    return null;
  }
  const dom = editor.api.toDOMNode(first);
  const editable = dom?.closest("[data-slate-editor]");
  return editable instanceof HTMLElement ? editable : null;
}

function boxOf(rect: DOMRect): AnchorBox {
  return { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
}

function blockBox(editor: SlateEditor, id: string): AnchorBox | null {
  const entry = findBlockById(editor, id);
  if (!entry) {
    return null;
  }
  const dom = editor.api.toDOMNode(entry[0]);
  if (!(dom instanceof HTMLElement)) {
    return null;
  }
  const rect = dom.getBoundingClientRect();
  if (rect.width <= 0 && rect.height <= 0) {
    return null;
  }
  return { top: rect.top, left: rect.left, width: 0, height: 0 };
}

function slateLink(editor: SlateEditor, target: Element): boolean {
  let current: Element | null = target;
  while (current) {
    if (current.tagName === "A" || current.hasAttribute("data-link-url")) {
      return true;
    }
    if (current.hasAttribute("data-slate-node")) {
      const slate = editor.api.toSlateNode(current);
      if (ElementApi.isElement(slate) && slate.type === KEYS.link) {
        return true;
      }
    }
    current = current.parentElement;
  }
  return false;
}

function contextProbe(editor: SlateEditor, event: MouseEvent): NativeMenuProbe {
  const target = event.target instanceof Element ? event.target : null;
  const slateSelection = editor.selection;
  const selectionCollapsed = slateSelection === null || RangeApi.isCollapsed(slateSelection);
  let pointInsideSelection = false;
  const domSelection = window.getSelection();
  if (
    !selectionCollapsed &&
    domSelection !== null &&
    !domSelection.isCollapsed &&
    domSelection.rangeCount > 0 &&
    event.target instanceof Node
  ) {
    pointInsideSelection = domSelection.getRangeAt(0).intersectsNode(event.target);
  }

  const code = target?.closest("code") ?? null;

  return {
    selectionCollapsed,
    pointInsideSelection,
    insideLink: target !== null && slateLink(editor, target),
    insideTableCell: target?.closest("td, th") !== null,
    insideCodeText: code !== null && code.parentElement?.tagName === "PRE",
    insideControl: target?.closest(CONTROL_SELECTOR) !== null,
    hasBlockTarget: target !== null && blockHandleTarget(chainFromDom(editor, target)) !== null,
  };
}

function isKind(value: string): value is BlockMenuKind {
  return BLOCK_MENU_KINDS.some((kind) => kind === value);
}

function BlockMenuItems({ target, onActed }: { target: BlockHandleHit; onActed: () => void }) {
  const editor = useEditorRef();
  const located = findBlockById(editor, target.id);
  const path = located?.[1];
  const view = path === undefined ? null : menuBlockView(editor, path);
  const decisions = view === null ? null : blockMenuDecisions(view);
  const current = view === null ? null : currentBlockMenuKind(view);

  function turn(kind: BlockMenuKind): void {
    if (!path || kind === current) {
      return;
    }
    const decision = decisions?.find((item) => item.kind === kind);
    if (!decision || !decision.allowed) {
      return;
    }
    onActed();
    runEditorCommand(editor, turnBlockInto, { path: [...path], kind });
  }

  function duplicate(): void {
    if (!path) {
      return;
    }
    onActed();
    runEditorCommand(editor, duplicateBlock, { path: [...path] });
  }

  function remove(): void {
    if (!path) {
      return;
    }
    onActed();
    runEditorCommand(editor, deleteBlock, { path: [...path] });
  }

  function move(direction: "up" | "down"): void {
    const located = findBlockById(editor, target.id);
    const at = located?.[1];
    if (!at) {
      return;
    }
    const step = siblingMove(editor.children, at, direction);
    if (!step.ok) {
      return;
    }
    onActed();
    const scroll = captureEditorScroll();
    runEditorCommand(editor, moveBlock, { from: [...at], to: step.to });
    settleMovedBlock(editor, scroll);
  }

  const up = path === undefined ? null : siblingMove(editor.children, path, "up");
  const down = path === undefined ? null : siblingMove(editor.children, path, "down");

  return (
    <>
      {decisions === null ? null : (
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <ArrowRightLeft aria-hidden="true" />
            Turn into
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent collisionPadding={8} hideWhenDetached>
            <DropdownMenuRadioGroup
              value={current ?? ""}
              onValueChange={(value) => {
                if (isKind(value)) {
                  turn(value);
                }
              }}
            >
              {decisions.map((item) => {
                const Icon = TURN_ICONS[item.kind];
                return (
                  <DropdownMenuRadioItem
                    key={item.kind}
                    value={item.kind}
                    disabled={!item.allowed}
                    data-block-menu-kind={item.kind}
                  >
                    <Icon aria-hidden="true" />
                    <span className="flex min-w-0 flex-col items-start">
                      <span>{item.label}</span>
                      {item.reason === undefined ? null : (
                        <span className="text-muted-foreground text-xs whitespace-normal">
                          {item.reason}
                        </span>
                      )}
                    </span>
                  </DropdownMenuRadioItem>
                );
              })}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      )}
      <DropdownMenuItem
        onSelect={() => {
          duplicate();
        }}
      >
        <Copy aria-hidden="true" />
        Duplicate
      </DropdownMenuItem>
      <DropdownMenuItem
        disabled={up === null || !up.ok}
        data-block-menu-move="up"
        onSelect={() => {
          move("up");
        }}
      >
        <ArrowUp aria-hidden="true" />
        <span className="flex min-w-0 flex-col items-start">
          <span>Move up</span>
          {up !== null && !up.ok ? (
            <span className="text-muted-foreground text-xs whitespace-normal">{up.reason}</span>
          ) : null}
        </span>
      </DropdownMenuItem>
      <DropdownMenuItem
        disabled={down === null || !down.ok}
        data-block-menu-move="down"
        onSelect={() => {
          move("down");
        }}
      >
        <ArrowDown aria-hidden="true" />
        <span className="flex min-w-0 flex-col items-start">
          <span>Move down</span>
          {down !== null && !down.ok ? (
            <span className="text-muted-foreground text-xs whitespace-normal">{down.reason}</span>
          ) : null}
        </span>
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        variant="destructive"
        onSelect={() => {
          remove();
        }}
      >
        <Trash2 aria-hidden="true" />
        Delete
      </DropdownMenuItem>
    </>
  );
}

export function BlockMenu({
  gripRef,
  holdMenu,
  bindOpener,
  bindCloser,
}: {
  gripRef: RefObject<HTMLButtonElement | null>;
  holdMenu: (id: string | null) => void;
  bindOpener: (open: (target: BlockHandleHit) => void) => void;
  bindCloser: (close: () => void) => void;
}) {
  const editor = useEditorRef();
  const [session, setSession] = useState<MenuSession | null>(null);
  const savedSelection = useRef(editor.selection);
  const acted = useRef(false);
  const sessionRef = useRef<MenuSession | null>(null);
  const pending = useRef<BlockHandleHit | null>(null);
  const frame = useRef(0);

  const close = useCallback(() => {
    pending.current = null;
    cancelAnimationFrame(frame.current);
    sessionRef.current = null;
    setSession(null);
    holdMenu(null);
  }, [holdMenu]);

  const openAt = useCallback(
    (target: BlockHandleHit, anchor: AnchorBox) => {
      const entry = findBlockById(editor, target.id);
      if (!entry || typeof entry[0].type !== "string") {
        return;
      }
      savedSelection.current = cloneRange(editor.selection);
      acted.current = false;
      pending.current = null;
      // Opening focuses the menu. Put the scroll ports back after that focus.
      retainScroll(() => undefined);
      cancelAnimationFrame(frame.current);
      holdMenu(target.id);
      const next = {
        target: { id: target.id, type: entry[0].type, path: [...entry[1]] },
        anchor,
      };
      sessionRef.current = next;
      setSession(next);
    },
    [editor, holdMenu],
  );

  const openFromGrip = useCallback(
    (target: BlockHandleHit) => {
      if (sessionRef.current?.target.id === target.id) {
        close();
        return;
      }
      const grip = gripRef.current?.getBoundingClientRect();
      const anchor = grip && grip.width > 0 ? boxOf(grip) : blockBox(editor, target.id);
      if (!anchor) {
        return;
      }
      openAt(target, anchor);
    },
    [close, editor, gripRef, openAt],
  );

  useLayoutEffect(() => {
    bindOpener(openFromGrip);
    bindCloser(close);
  }, [bindCloser, bindOpener, close, openFromGrip]);

  useEffect(() => {
    return () => {
      cancelAnimationFrame(frame.current);
    };
  }, []);

  useLayoutEffect(() => {
    const editable = editableOf(editor);
    if (!editable) {
      return;
    }

    const onContextMenu = (event: MouseEvent): void => {
      if (keepNativeContextMenu(contextProbe(editor, event))) {
        return;
      }
      const target = event.target instanceof Element ? event.target : null;
      const picked = target ? blockHandleTarget(chainFromDom(editor, target)) : null;
      if (!picked) {
        return;
      }
      const entry = findBlockById(editor, picked.id);
      if (!entry) {
        return;
      }
      event.preventDefault();
      openAt(
        { id: picked.id, type: picked.type, path: [...entry[1]] },
        { top: event.clientY, left: event.clientX, width: 0, height: 0 },
      );
    };

    const onKeyDown = (event: KeyboardEvent): void => {
      if (!isBlockMenuShortcut(event) || event.isComposing) {
        return;
      }
      const eventTarget = event.target instanceof Element ? event.target : null;
      if (eventTarget?.closest("input, textarea, select, [role='menu'], [data-block-menu]")) {
        return;
      }
      const selection = editor.selection;
      if (!selection) {
        return;
      }
      const hit = targetBlockAtPath(editor, selection.anchor.path);
      if (!hit) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const grip = gripRef.current?.getBoundingClientRect();
      if (grip && grip.width > 0) {
        openAt(hit, boxOf(grip));
        return;
      }
      pending.current = hit;
      holdMenu(hit.id);
      cancelAnimationFrame(frame.current);
      // The handle paints on the next layout. A second frame sees the grip, or the block.
      frame.current = requestAnimationFrame(() => {
        frame.current = requestAnimationFrame(() => {
          const waiting = pending.current;
          if (!waiting) {
            return;
          }
          const shown = gripRef.current?.getBoundingClientRect();
          const anchor = shown && shown.width > 0 ? boxOf(shown) : blockBox(editor, waiting.id);
          if (anchor) {
            openAt(waiting, anchor);
          }
        });
      });
    };

    editable.addEventListener("contextmenu", onContextMenu);
    editable.addEventListener("keydown", onKeyDown, true);
    return () => {
      editable.removeEventListener("contextmenu", onContextMenu);
      editable.removeEventListener("keydown", onKeyDown, true);
    };
  }, [editor, gripRef, holdMenu, openAt]);

  useEffect(() => {
    if (!session) {
      return;
    }
    // A click on the page chrome must not move the caret. Real controls still receive it.
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target instanceof Element ? event.target : null;
      if (
        !target ||
        target.closest("[data-block-menu], [data-block-menu-anchor], [data-block-handle]")
      ) {
        return;
      }
      const editable = editableOf(editor);
      if (editable?.contains(target) || target.closest(PAGE_CONTROL_SELECTOR)) {
        return;
      }
      event.preventDefault();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [editor, session]);

  if (!session) {
    return null;
  }

  return (
    <DropdownMenu
      open
      modal={false}
      onOpenChange={(next) => {
        if (!next) {
          close();
        }
      }}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label="Block menu"
              tabIndex={-1}
              data-block-menu-anchor=""
              className="pointer-events-none fixed p-0 opacity-0"
              style={{
                top: session.anchor.top,
                left: session.anchor.left,
                width: session.anchor.width,
                height: session.anchor.height,
              }}
            >
              <Type aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>Block menu</TooltipContent>
      </Tooltip>
      <DropdownMenuContent
        align="start"
        side="bottom"
        sideOffset={4}
        collisionPadding={8}
        hideWhenDetached
        data-block-menu=""
        data-block-menu-for={session.target.id}
        className="w-64"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          const selection = cloneRange(acted.current ? editor.selection : savedSelection.current);
          // Chrome places the caret under the pointer when focus returns from a click.
          // Deselect first so the saved range is written, then again after that placement.
          const restore = (): void => {
            editor.tf.withoutSaving(() => {
              editor.tf.focus();
              if (!selection) {
                return;
              }
              editor.tf.deselect();
              editor.tf.select(selection);
            });
          };
          retainScroll(restore);
          requestAnimationFrame(() => {
            retainScroll(restore);
          });
        }}
      >
        <BlockMenuItems
          target={session.target}
          onActed={() => {
            acted.current = true;
          }}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
