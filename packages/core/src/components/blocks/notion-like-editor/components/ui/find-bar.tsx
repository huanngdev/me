import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { CaseSensitive, ChevronDown, ChevronUp, Replace, ReplaceAll, X } from "lucide-react";
import { type SlateEditor } from "platejs";
import { useEditorReadOnly, useEditorRef, useEditorSelector, usePluginOption } from "platejs/react";

import { Input } from "@/components/input";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/popover";
import { Separator } from "@/components/separator";
import { Toggle } from "@/components/toggle";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/tooltip";

import { runEditorCommand } from "../../lib/commands/editor-commands";
import { FIND_MATCH_MAX } from "../../lib/features/editor-find";
import { replaceAllFindMatches, replaceFindMatch } from "../../lib/features/editor-find-replace";
import {
  closeFind,
  findActiveMatch,
  findNext,
  findPlugin,
  findPrevious,
  findState,
  revealFindMatch,
  setFindMatchCase,
  setFindQuery,
  type FindState,
} from "../../lib/plugins/editor-find";
import {
  isFindOpenKey,
  isHighlightVisible,
  isMacPlatform,
  onFindKeyDown,
} from "../../lib/plugins/editor-find-ui";
import {
  EditorIconButton,
  EditorTextButton,
  focusEditorWithoutScroll,
  retainScroll,
} from "./block-toolbar";
import { anchorContext, pointRect, virtualAnchor } from "./anchor-rect";

function countLabel(state: FindState): string {
  if (state.query.length === 0) {
    return "";
  }
  if (state.count === 0) {
    return "No results";
  }

  const position = state.activeIndex + 1;
  return state.truncated ? `${position} of ${FIND_MATCH_MAX}+` : `${position} of ${state.count}`;
}

function editorRoot(editor: SlateEditor): HTMLElement | null {
  const root = editor.api.toDOMNode(editor);
  if (root instanceof HTMLElement) {
    return root;
  }

  const fallback = document.querySelector("[data-slate-editor]");
  return fallback instanceof HTMLElement ? fallback : null;
}

// Must exceed the popover's collisionPadding (8): Radix hides the bar when the anchor is within that padding of the clip edge.
const ANCHOR_INSET = 16;

// Top-right corner of the visible editor, 8px down. Zero size, so the popover sits at that point.
function barAnchorRect(root: HTMLElement | null): DOMRect {
  if (root === null) {
    return pointRect(0, 0);
  }

  const box = root.getBoundingClientRect();
  const viewport = root.closest("[data-block-viewport]");
  const viewportTop = viewport === null ? 0 : viewport.getBoundingClientRect().top;
  return pointRect(box.right, Math.max(box.top, viewportTop) + ANCHOR_INSET);
}

// Scrolls only when the active highlight is outside the scroll area, or under the bar's band.
function scrollActiveIntoView(editor: SlateEditor): void {
  const node = editorRoot(editor)?.querySelector("[data-find-active]");
  if (!(node instanceof HTMLElement)) {
    return;
  }

  const scroller = node.closest("[data-block-viewport]");
  const container =
    scroller instanceof HTMLElement
      ? scroller.getBoundingClientRect()
      : { top: 0, left: 0, bottom: window.innerHeight, right: window.innerWidth };
  if (!isHighlightVisible(node.getBoundingClientRect(), container)) {
    node.scrollIntoView({ block: "center", inline: "nearest" });
  }
}

// After a query, match case, navigation or replace. The highlight is in the DOM after React commits.
function afterMove(editor: SlateEditor): void {
  revealFindMatch(editor);
  requestAnimationFrame(() => {
    scrollActiveIntoView(editor);
  });
}

// Closes the bar and puts the caret on the active match, so the user lands on the result.
export function closeFindBar(editor: SlateEditor): void {
  const match = findActiveMatch(editor);
  closeFind(editor);
  retainScroll(() => {
    focusEditorWithoutScroll(editorRoot(editor));
    if (match !== undefined) {
      editor.tf.select(match);
    }
  });
}

function ToolbarSeparator() {
  return (
    <Separator
      orientation="vertical"
      data-toolbar-separator=""
      className="h-5 shrink-0 data-vertical:self-center"
    />
  );
}

function focusFindInput(input: HTMLInputElement | null): void {
  if (input) {
    input.focus();
    input.select();
  }
}

function MatchCaseToggle({
  pressed,
  onChange,
}: {
  pressed: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Toggle
            variant="default"
            pressed={pressed}
            aria-label="Match case"
            className="size-8 shrink-0 px-0"
            onPressedChange={onChange}
          >
            <CaseSensitive aria-hidden="true" />
          </Toggle>
        </TooltipTrigger>
        <TooltipContent>Match case</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// Find bar mounted in the editor surface. It renders nothing while closed.
export function FindBar() {
  "use no memo";

  const editor = useEditorRef();
  const readOnly = useEditorReadOnly();
  const open = usePluginOption(findPlugin, "open");
  const query = usePluginOption(findPlugin, "query");
  const matchCase = usePluginOption(findPlugin, "matchCase");
  const focusRequest = usePluginOption(findPlugin, "focusRequest");
  // Navigation writes activeIndex, so the count follows it.
  usePluginOption(findPlugin, "activeIndex");
  // Re-renders the bar on every document change, so the count follows edits.
  useEditorSelector((current) => current.children, []);
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [replacement, setReplacement] = useState("");
  const findRef = useRef<HTMLInputElement>(null);
  const virtualRef = virtualAnchor(
    () => barAnchorRect(editorRoot(editor)),
    () => anchorContext(editorRoot(editor)),
  );

  // Mod+F on the editable element, so it also works in a read-only editor. Not a document listener.
  useEffect(() => {
    const root = editorRoot(editor);
    if (root === null) {
      return;
    }

    const onKey = (event: KeyboardEvent): void => {
      onFindKeyDown(editor, event);
    };
    root.addEventListener("keydown", onKey);
    return () => {
      root.removeEventListener("keydown", onKey);
    };
  }, [editor]);

  useEffect(() => {
    if (!open) {
      return;
    }

    focusFindInput(findRef.current);
    requestAnimationFrame(() => {
      scrollActiveIntoView(editor);
    });
  }, [editor, open, focusRequest]);

  if (!open) {
    return null;
  }

  const state = findState(editor);
  const showReplace = replaceOpen && !readOnly;

  function move(step: 1 | -1): void {
    if (step > 0) {
      findNext(editor);
    } else {
      findPrevious(editor);
    }
    afterMove(editor);
  }

  function changeQuery(value: string): void {
    setFindQuery(editor, value);
    afterMove(editor);
  }

  function changeMatchCase(value: boolean): void {
    setFindMatchCase(editor, value);
    afterMove(editor);
  }

  function replaceCurrent(): void {
    if (runEditorCommand(editor, replaceFindMatch, { replacement })) {
      afterMove(editor);
    }
  }

  function replaceEvery(): void {
    if (runEditorCommand(editor, replaceAllFindMatches, { replacement })) {
      afterMove(editor);
    }
  }

  // Keys typed in the bar never reach the editor. Mod+F selects the find text, and Escape closes.
  function onSurfaceKeyDown(event: ReactKeyboardEvent<HTMLDivElement>): void {
    event.stopPropagation();
    if (isFindOpenKey(event, isMacPlatform())) {
      event.preventDefault();
      focusFindInput(findRef.current);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      closeFindBar(editor);
    }
  }

  function onFindInputKeyDown(event: ReactKeyboardEvent<HTMLInputElement>): void {
    if (event.nativeEvent.isComposing || event.key !== "Enter") {
      return;
    }
    event.preventDefault();
    move(event.shiftKey ? -1 : 1);
  }

  function onReplaceInputKeyDown(event: ReactKeyboardEvent<HTMLInputElement>): void {
    if (event.nativeEvent.isComposing || event.key !== "Enter") {
      return;
    }
    event.preventDefault();
    replaceCurrent();
  }

  // Pressing in the bar keeps focus where it is, except in an input, so the caret stays in the field.
  function onSurfaceMouseDown(event: ReactMouseEvent<HTMLDivElement>): void {
    if (!(event.target instanceof HTMLInputElement)) {
      event.preventDefault();
    }
  }

  // The bar closes only from its own Close button or Escape. Outside presses never close it.
  return (
    <Popover open modal={false}>
      <PopoverAnchor virtualRef={virtualRef} />
      <PopoverContent
        data-find-bar=""
        role="search"
        aria-label="Find in document"
        side="bottom"
        align="end"
        sideOffset={0}
        collisionPadding={8}
        hideWhenDetached
        className="w-auto max-w-[calc(100vw-1rem)] gap-1 p-2"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          focusFindInput(findRef.current);
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
        }}
        onInteractOutside={(event) => {
          event.preventDefault();
        }}
        onPointerDownOutside={(event) => {
          event.preventDefault();
        }}
        onFocusOutside={(event) => {
          event.preventDefault();
        }}
        onEscapeKeyDown={(event) => {
          event.preventDefault();
        }}
        onMouseDown={onSurfaceMouseDown}
        onKeyDown={onSurfaceKeyDown}
      >
        <div className="flex min-w-0 items-center gap-1">
          <Input
            ref={findRef}
            aria-label="Find"
            placeholder="Find"
            data-find-input=""
            value={query}
            onChange={(event) => {
              changeQuery(event.currentTarget.value);
            }}
            onKeyDown={onFindInputKeyDown}
            className="w-44 min-w-0 shrink text-sm"
          />
          <span
            data-find-count=""
            aria-live="polite"
            className="text-muted-foreground min-w-16 shrink-0 text-right text-xs whitespace-nowrap tabular-nums"
          >
            {countLabel(state)}
          </span>
          <ToolbarSeparator />
          <EditorIconButton
            label="Previous match"
            icon={<ChevronUp aria-hidden="true" />}
            disabled={state.count === 0}
            onClick={() => {
              move(-1);
            }}
            className="shrink-0"
          />
          <EditorIconButton
            label="Next match"
            icon={<ChevronDown aria-hidden="true" />}
            disabled={state.count === 0}
            onClick={() => {
              move(1);
            }}
            className="shrink-0"
          />
          <ToolbarSeparator />
          <MatchCaseToggle pressed={matchCase} onChange={changeMatchCase} />
          {readOnly ? null : (
            <EditorIconButton
              label="Toggle replace"
              icon={<Replace aria-hidden="true" />}
              aria-expanded={showReplace}
              onClick={() => {
                setReplaceOpen((value) => !value);
              }}
              className="shrink-0"
            />
          )}
          <ToolbarSeparator />
          <EditorIconButton
            label="Close"
            icon={<X aria-hidden="true" />}
            onClick={() => {
              closeFindBar(editor);
            }}
            className="shrink-0"
          />
        </div>
        {showReplace ? (
          <div className="flex min-w-0 items-center gap-1">
            <Input
              aria-label="Replace with"
              placeholder="Replace with"
              data-find-replace-input=""
              value={replacement}
              onChange={(event) => {
                setReplacement(event.currentTarget.value);
              }}
              onKeyDown={onReplaceInputKeyDown}
              className="w-44 min-w-0 shrink text-sm"
            />
            <EditorTextButton
              label="Replace"
              icon={<Replace aria-hidden="true" />}
              disabled={state.count === 0}
              onClick={replaceCurrent}
              className="shrink-0"
            />
            <EditorTextButton
              label="Replace all"
              icon={<ReplaceAll aria-hidden="true" />}
              disabled={state.count === 0 || state.truncated}
              onClick={replaceEvery}
              className="shrink-0"
            />
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
