import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import {
  useEditorRef,
  usePluginOption,
  useReadOnly,
  useSelected,
  type PlateElementProps,
} from "platejs/react";

import { Command, CommandGroup, CommandItem, CommandList } from "@/components/command";
import { Input } from "@/components/input";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/popover";
import { cn } from "@/lib/utils";

import { anchorContext, elementRect, virtualAnchor } from "../ui/anchor-rect";
import { retainScroll } from "../ui/block-toolbar";
import { ScrollFadeArea } from "../ui/editor-scroll";

import {
  MENTION_EMPTY_LABEL,
  MENTION_ERROR_LABEL,
  MENTION_LOADING_LABEL,
  MENTION_UNKNOWN_LABEL,
  attachMentionProvider,
  commitMention,
  mentionUiPlugin,
  onMentionInputKeyDown,
  setMentionInputComposing,
  setMentionQuery,
} from "../../lib/plugins/editor-mention";
import type { MentionProvider } from "../../lib/features/editor-mention-node";

const MentionProviderContext = createContext<MentionProvider | null>(null);

export function MentionScope({
  provider,
  children,
}: {
  provider: MentionProvider | null;
  children: ReactNode;
}) {
  const editor = useEditorRef();
  // During render, not in an effect: child effects run first, and the chip resolves in that same commit.
  attachMentionProvider(editor, provider);
  return (
    <MentionProviderContext.Provider value={provider}>{children}</MentionProviderContext.Provider>
  );
}

type MentionState = "pending" | "known" | "unknown";

function storedField(element: PlateElementProps["element"], key: string): string {
  const value = element[key];
  return typeof value === "string" ? value : "";
}

export function MentionElement({ attributes, children, element }: PlateElementProps) {
  "use no memo";

  const provider = useContext(MentionProviderContext);
  const entityType = storedField(element, "entityType");
  const entityId = storedField(element, "entityId");
  const label = storedField(element, "label");
  const resolve = provider?.resolve;

  return (
    <MentionChip
      key={`${entityType}\0${entityId}\0${resolve === undefined ? "stored" : "resolve"}`}
      attributes={attributes}
      entityType={entityType}
      entityId={entityId}
      label={label}
      resolve={resolve}
    >
      {children}
    </MentionChip>
  );
}

function MentionChip({
  attributes,
  children,
  entityType,
  entityId,
  label,
  resolve,
}: {
  attributes: PlateElementProps["attributes"];
  children: ReactNode;
  entityType: string;
  entityId: string;
  label: string;
  resolve: MentionProvider["resolve"];
}) {
  const selected = useSelected();
  const [state, setState] = useState<MentionState>(resolve === undefined ? "known" : "pending");

  useEffect(() => {
    if (resolve === undefined) {
      return;
    }

    const controller = new AbortController();
    let alive = true;
    void resolve(entityType, entityId, controller.signal)
      .then((entity) => {
        if (!alive) {
          return;
        }

        setState(entity === null ? "unknown" : "known");
      })
      .catch(() => {
        if (!alive) {
          return;
        }

        setState("known");
      });

    return () => {
      alive = false;
      controller.abort();
    };
  }, [resolve, entityType, entityId]);

  const slateClass = typeof attributes.className === "string" ? attributes.className : "";
  const unknown = state === "unknown";

  return (
    <span
      {...attributes}
      contentEditable={false}
      className={cn(
        slateClass,
        "inline align-baseline font-medium",
        unknown ? "text-muted-foreground" : "text-foreground",
        selected && "bg-muted rounded-sm",
      )}
      data-mention-entity-type={entityType}
      data-mention-entity-id={entityId}
      data-mention-state={state}
      title={unknown ? MENTION_UNKNOWN_LABEL : undefined}
    >
      @{label}
      {children}
    </span>
  );
}

export function MentionInputElement({ attributes, children, element }: PlateElementProps) {
  "use no memo";

  const editor = useEditorRef();
  const readOnly = useReadOnly();
  const virtualRef = virtualAnchor(
    () => elementRect(editor.api.toDOMNode(element) ?? null),
    () => anchorContext(editor.api.toDOMNode(element) ?? null),
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const query = usePluginOption(mentionUiPlugin, "query");
  const status = usePluginOption(mentionUiPlugin, "status");
  const results = usePluginOption(mentionUiPlugin, "results");
  const activeIndex = usePluginOption(mentionUiPlugin, "activeIndex");

  useEffect(() => {
    if (readOnly) {
      return;
    }

    inputRef.current?.focus({ preventScroll: true });
    setMentionQuery(editor, editor.getOption(mentionUiPlugin, "query"));
  }, [editor, readOnly]);

  const slateClass = typeof attributes.className === "string" ? attributes.className : "";
  if (readOnly) {
    return (
      <span {...attributes} className={slateClass}>
        @{query}
        {children}
      </span>
    );
  }

  return (
    <Popover open modal={false}>
      <span
        {...attributes}
        contentEditable={false}
        className={cn(
          slateClass,
          "bg-accent text-accent-foreground inline-flex items-baseline rounded-md px-1 align-baseline",
        )}
        data-mention-input=""
      >
        <span>@</span>
        <Input
          ref={inputRef}
          value={query}
          className="text-accent-foreground placeholder:text-accent-foreground/70 h-auto w-auto min-w-[1ch] rounded-none border-0 bg-transparent px-0 py-0 shadow-none focus-visible:ring-0 md:text-base dark:bg-transparent"
          style={{ width: `${Math.max(query.length, 1) + 0.5}ch` }}
          aria-label="Mention"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={true}
          aria-controls="mention-results"
          onChange={(event) => {
            const next = event.currentTarget.value;
            const native = event.nativeEvent;
            if ("isComposing" in native && native.isComposing === true) {
              editor.setOption(mentionUiPlugin, "query", next);
              return;
            }

            setMentionQuery(editor, next);
          }}
          onCompositionStart={(event) => {
            event.stopPropagation();
            setMentionInputComposing(editor, true);
          }}
          onCompositionEnd={(event) => {
            event.stopPropagation();
            setMentionInputComposing(editor, false);
            setMentionQuery(editor, event.currentTarget.value);
          }}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === "Escape" || event.key === "Enter" || event.key === "Tab") {
              retainScroll(() => {
                onMentionInputKeyDown(editor, event);
              });
              return;
            }
            onMentionInputKeyDown(editor, event);
          }}
        />
        {children}
      </span>
      <PopoverAnchor virtualRef={virtualRef} />
      <PopoverContent
        side="bottom"
        align="start"
        sideOffset={4}
        collisionPadding={8}
        hideWhenDetached
        className="w-64 p-0"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
        }}
        onMouseDown={(event) => {
          event.preventDefault();
        }}
      >
        <div id="mention-results">
          <Command shouldFilter={false}>
            <ScrollFadeArea orientation="vertical" className="max-h-72">
              <CommandList className="max-h-none overflow-visible p-0">
                {status === "loading" ? (
                  <div
                    className="text-muted-foreground px-2 py-3 text-sm"
                    data-mention-status="loading"
                  >
                    {MENTION_LOADING_LABEL}
                  </div>
                ) : null}
                {status === "empty" ? (
                  <div
                    className="text-muted-foreground px-2 py-3 text-sm"
                    data-mention-status="empty"
                  >
                    {MENTION_EMPTY_LABEL}
                  </div>
                ) : null}
                {status === "error" ? (
                  <div
                    className="text-muted-foreground px-2 py-3 text-sm"
                    data-mention-status="error"
                  >
                    {MENTION_ERROR_LABEL}
                  </div>
                ) : null}
                {status === "ready" ? (
                  <CommandGroup>
                    {results.map((person, index) => (
                      <CommandItem
                        key={person.entityId}
                        value={person.entityId}
                        data-mention-entity-id={person.entityId}
                        data-mention-active={index === activeIndex ? "true" : "false"}
                        className={index === activeIndex ? "bg-muted" : undefined}
                        onMouseDown={(event) => {
                          event.preventDefault();
                        }}
                        onSelect={() => {
                          commitMention(editor, person);
                        }}
                      >
                        <span className="flex min-w-0 flex-col">
                          <span>{person.label}</span>
                          <span className="text-muted-foreground text-xs">
                            {person.email ?? person.entityId}
                          </span>
                        </span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                ) : null}
              </CommandList>
            </ScrollFadeArea>
          </Command>
        </div>
      </PopoverContent>
    </Popover>
  );
}
