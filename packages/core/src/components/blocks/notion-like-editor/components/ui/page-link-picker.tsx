import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { useEditorReadOnly, useEditorRef, usePluginOption } from "platejs/react";
import { FileText } from "lucide-react";

import { Input } from "@/components/input";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/popover";
import { cn } from "@/lib/utils";

import { PAGE_LINK_ICON_CLASS } from "../elements/page-link-classes";
import { retainScroll } from "./block-toolbar";
import { anchorContext, rangeContextElement, rangeRect, virtualAnchor } from "./anchor-rect";
import {
  PAGE_LINK_SEARCH_SLOW_MS,
  pageLinkDisplayTitle,
  pagesFromSearch,
  type PageEntity,
  type PageProvider,
} from "../../lib/features/editor-page-link";
import { pageLinkProvider } from "../../lib/plugins/editor-page-link";
import {
  cancelPageLinkPicker,
  choosePageLink,
  pageLinkPickerAnchorPoint,
  pageLinkPickerOpen,
  pageLinkPickerPlugin,
} from "../../lib/plugins/editor-page-link-picker";

export function PageLinkPicker() {
  "use no memo";

  const editor = useEditorRef();
  const readOnly = useEditorReadOnly();
  const open = usePluginOption(pageLinkPickerPlugin, "open");

  useEffect(() => {
    if (!open || !readOnly) {
      return;
    }
    retainScroll(() => {
      cancelPageLinkPicker(editor);
    });
  }, [editor, open, readOnly]);

  const provider = pageLinkProvider(editor);
  if (!open || readOnly || provider === null || !pageLinkPickerOpen(editor)) {
    return null;
  }

  return <PageLinkPickerForm editor={editor} provider={provider} />;
}

type SearchResult = { query: string; pages: PageEntity[] | null };

function pickerDomRange(editor: ReturnType<typeof useEditorRef>): Range | null {
  const point = pageLinkPickerAnchorPoint(editor);
  if (point === null) {
    return null;
  }

  try {
    return editor.api.toDOMRange({ anchor: point, focus: point }) ?? null;
  } catch {
    return null;
  }
}

function PageLinkPickerForm({
  editor,
  provider,
}: {
  editor: ReturnType<typeof useEditorRef>;
  provider: PageProvider;
}) {
  "use no memo";

  const [query, setQuery] = useState("");
  const [activeRow, setActiveRow] = useState(0);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [slowQuery, setSlowQuery] = useState<string | null>(null);
  const fieldRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const virtualRef = virtualAnchor(
    () => rangeRect(pickerDomRange(editor)),
    () => anchorContext(rangeContextElement(pickerDomRange(editor))),
  );

  // Each query aborts the previous search. A result for an older query is ignored.
  useEffect(() => {
    const controller = new AbortController();
    let live = true;
    const slowTimer = setTimeout(() => {
      if (live) {
        setSlowQuery(query);
      }
    }, PAGE_LINK_SEARCH_SLOW_MS);

    let pending: Promise<unknown>;
    try {
      pending = provider.search(query, controller.signal);
    } catch {
      pending = Promise.reject(new Error("search threw"));
    }
    void pending.then(
      (value) => {
        if (!live) {
          return;
        }
        clearTimeout(slowTimer);
        setResult({ query, pages: pagesFromSearch(value) });
      },
      () => {
        if (!live) {
          return;
        }
        clearTimeout(slowTimer);
        setResult({ query, pages: null });
      },
    );

    return () => {
      live = false;
      clearTimeout(slowTimer);
      controller.abort();
    };
  }, [provider, query]);

  useEffect(() => {
    const focusField = (): void => {
      fieldRef.current?.focus();
    };
    focusField();
    const frame = requestAnimationFrame(focusField);
    return () => {
      cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target;
      if (target instanceof Element && target.closest("[data-page-link-picker]") !== null) {
        return;
      }

      event.preventDefault();
      retainScroll(() => {
        cancelPageLinkPicker(editor);
      });
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [editor]);

  const settled = result !== null && result.query === query ? result : null;
  const pages = settled?.pages ?? [];
  const failed = settled !== null && settled.pages === null;
  const searching = settled === null && slowQuery === query;
  const current = pages.length === 0 ? -1 : Math.min(activeRow, pages.length - 1);
  let message = "";
  if (failed) {
    message = "Could not load pages";
  } else if (settled !== null && pages.length === 0) {
    message = "No pages found";
  } else if (searching) {
    message = "Searching…";
  }

  const optionId = (index: number): string => `${listId}-option-${index}`;

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    // Keys typed here never reach the editor.
    event.stopPropagation();
    if (event.nativeEvent.isComposing) {
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      retainScroll(() => {
        cancelPageLinkPicker(editor);
      });
      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (pages.length === 0) {
        return;
      }
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActiveRow((Math.max(current, 0) + step + pages.length) % pages.length);
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      const page = pages[current];
      if (page === undefined) {
        return;
      }
      retainScroll(() => {
        choosePageLink(editor, page);
      });
    }
  };

  return (
    <Popover open>
      <PopoverAnchor virtualRef={virtualRef} />
      <PopoverContent
        data-page-link-picker=""
        side="bottom"
        align="start"
        sideOffset={4}
        collisionPadding={8}
        hideWhenDetached
        onOpenAutoFocus={(event) => {
          event.preventDefault();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
        }}
        className="w-72 gap-2 p-2"
      >
        <Input
          ref={fieldRef}
          role="combobox"
          aria-label="Search pages"
          aria-expanded={pages.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={current >= 0 ? optionId(current) : undefined}
          placeholder="Search pages"
          type="text"
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveRow(0);
          }}
          onKeyDown={onKeyDown}
        />
        <div role="listbox" id={listId} aria-label="Pages" className="flex flex-col">
          {pages.map((page, index) => (
            <div
              key={`${page.pageId}-${index}`}
              id={optionId(index)}
              role="option"
              aria-selected={index === current}
              data-page-option={page.pageId}
              className={cn(
                "flex cursor-default items-center gap-2 rounded-sm px-2 py-1 text-sm",
                index === current && "bg-accent text-accent-foreground",
              )}
              onMouseDown={(event) => {
                event.preventDefault();
              }}
              onClick={() => {
                retainScroll(() => {
                  choosePageLink(editor, page);
                });
              }}
            >
              {page.icon !== undefined ? (
                <span aria-hidden="true" className={PAGE_LINK_ICON_CLASS}>
                  {page.icon}
                </span>
              ) : (
                <FileText aria-hidden="true" className={PAGE_LINK_ICON_CLASS} />
              )}
              <span className="min-w-0 truncate">{pageLinkDisplayTitle(page.title)}</span>
            </div>
          ))}
        </div>
        <p
          data-page-link-status=""
          aria-live="polite"
          className="text-muted-foreground px-2 py-1.5 text-sm"
        >
          {message}
        </p>
      </PopoverContent>
    </Popover>
  );
}
