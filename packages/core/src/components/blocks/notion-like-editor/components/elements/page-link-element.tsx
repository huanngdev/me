import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  PlateElement,
  useEditorRef,
  useElement,
  useFocused,
  useReadOnly,
  useSelected,
  type PlateElementProps,
} from "platejs/react";

import { cn } from "@/lib/utils";

import {
  cleanPageLinkTitle,
  isStoredPageId,
  pageLinkDisplayTitle,
  sanitizePageEntity,
  storedPageLinkKind,
  type PageEntity,
  type PageLinkStatus,
  type PageOpenRequest,
  type PageProvider,
} from "../../lib/features/editor-page-link";
import {
  attachPageLinkHost,
  openPageLink,
  setPageLinkStatus,
} from "../../lib/plugins/editor-page-link";
import { PageLinkBody } from "../static/page-link-body";
import { hrElementClassName } from "./hr-element";
import { PAGE_LINK_ROW_CLASS } from "./page-link-classes";

const PAGE_LINK_RESOLVE_TIMEOUT_MS = 5000;

let resolveTimeoutMs = PAGE_LINK_RESOLVE_TIMEOUT_MS;

export function setPageLinkResolveTimeoutMs(ms: number): () => void {
  const previous = resolveTimeoutMs;
  resolveTimeoutMs = ms;
  return () => {
    resolveTimeoutMs = previous;
  };
}

type PageLinkScopeValue = {
  provider: PageProvider | null;
  onOpenPage: ((request: PageOpenRequest) => void) | null;
};

const PageLinkScopeContext = createContext<PageLinkScopeValue>({
  provider: null,
  onOpenPage: null,
});

export function PageLinkScope({
  provider,
  onOpenPage,
  children,
}: PageLinkScopeValue & { children: ReactNode }) {
  const editor = useEditorRef();
  // During render, not in an effect: child effects run first, and a row resolves in that same commit.
  attachPageLinkHost(editor, { provider, onOpenPage });
  const value = useMemo(() => ({ provider, onOpenPage }), [provider, onOpenPage]);
  return <PageLinkScopeContext.Provider value={value}>{children}</PageLinkScopeContext.Provider>;
}

type Outcome =
  { status: "ok"; page: PageEntity } | { status: "missing" | "denied" | "unavailable" };

type Resolved = { pageId: string; outcome: Outcome };

const LABELS: Partial<Record<PageLinkStatus, string>> = {
  missing: "Page not found",
  denied: "No access",
  unavailable: "Unavailable",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

// The provider is untrusted, so anything but a well-formed answer is unavailable.
function outcomeOf(resolution: unknown): Outcome {
  if (!isRecord(resolution)) {
    return { status: "unavailable" };
  }

  if (resolution.status === "missing" || resolution.status === "denied") {
    return { status: resolution.status };
  }

  const page = resolution.page;
  if (resolution.status === "ok" && isRecord(page) && typeof page.title === "string") {
    return {
      status: "ok",
      page: sanitizePageEntity({
        pageId: typeof page.pageId === "string" ? page.pageId : "",
        title: page.title,
        icon: typeof page.icon === "string" ? page.icon : undefined,
      }),
    };
  }

  return { status: "unavailable" };
}

export function PageLinkElement(props: PlateElementProps) {
  const editor = useEditorRef();
  const element = useElement();
  const readOnly = useReadOnly();
  const selected = useSelected();
  const focused = useFocused();
  const { provider, onOpenPage } = useContext(PageLinkScopeContext);
  const id = typeof element.id === "string" ? element.id : "";
  const pageId = typeof element.pageId === "string" ? element.pageId : "";
  const pageIdValid = isStoredPageId(pageId);
  const kind = storedPageLinkKind(element.kind);
  const storedTitle = typeof element.title === "string" ? cleanPageLinkTitle(element.title) : "";
  const rowRef = useRef<HTMLDivElement>(null);
  const [resolved, setResolved] = useState<Resolved | undefined>(undefined);

  // Resolving reads only. It never writes the document, so it adds no history entry.
  useEffect(() => {
    if (provider === null || !pageIdValid) {
      return;
    }

    const controller = new AbortController();
    let active = true;
    const timer = setTimeout(() => {
      controller.abort();
    }, resolveTimeoutMs);

    const finish = (outcome: Outcome): void => {
      if (!active) {
        return;
      }

      clearTimeout(timer);
      setResolved({ pageId, outcome });
    };

    controller.signal.addEventListener("abort", () => {
      finish({ status: "unavailable" });
    });

    let pending: Promise<unknown>;
    try {
      pending = provider.resolve(pageId, controller.signal);
    } catch {
      pending = Promise.reject(new Error("resolve threw"));
    }

    void pending.then(
      (resolution) => {
        if (controller.signal.aborted) {
          return;
        }

        finish(outcomeOf(resolution));
      },
      () => {
        finish({ status: "unavailable" });
      },
    );

    return () => {
      active = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [provider, pageId, pageIdValid]);

  const current = resolved?.pageId === pageId ? resolved.outcome : undefined;
  let status: PageLinkStatus;
  if (!pageIdValid) {
    status = "missing";
  } else if (provider === null) {
    status = "fallback";
  } else if (current === undefined) {
    status = "loading";
  } else {
    status = current.status;
  }

  useEffect(() => {
    setPageLinkStatus(editor, id, status);
    return () => {
      setPageLinkStatus(editor, id, undefined);
    };
  }, [editor, id, status]);

  useEffect(() => {
    const node = rowRef.current;
    if (!node || readOnly) {
      return;
    }

    // A plain click selects the block and never opens the page in edit mode.
    const onMouseDown = (event: MouseEvent): void => {
      if (event.button !== 0) {
        return;
      }

      const path = editor.api.findPath(element);
      if (path) {
        editor.tf.select(path);
      }
    };
    node.addEventListener("mousedown", onMouseDown);
    return () => {
      node.removeEventListener("mousedown", onMouseDown);
    };
  }, [editor, element, readOnly]);

  const page = current?.status === "ok" ? current.page : undefined;
  const shownTitle = page !== undefined ? page.title : storedTitle;
  const canOpen = onOpenPage !== null && status !== "missing" && status !== "denied";
  const request: PageOpenRequest = { pageId, kind };

  return (
    <PlateElement {...props} className="relative py-1">
      <div className="relative" contentEditable={false} data-block-handle-anchor="">
        <div
          ref={rowRef}
          role={readOnly ? "link" : undefined}
          tabIndex={readOnly ? 0 : undefined}
          aria-label={readOnly ? pageLinkDisplayTitle(shownTitle) : undefined}
          aria-disabled={readOnly && !canOpen ? true : undefined}
          data-page-link=""
          data-page-id={pageId}
          data-page-kind={kind}
          data-page-status={status}
          className={cn(PAGE_LINK_ROW_CLASS, hrElementClassName(selected, focused, readOnly))}
          onClick={(event) => {
            if (!readOnly && !event.metaKey && !event.ctrlKey) {
              return;
            }

            event.preventDefault();
            openPageLink(editor, request, id);
          }}
          onKeyDown={(event) => {
            if (!readOnly || (event.key !== "Enter" && event.key !== " ")) {
              return;
            }

            event.preventDefault();
            openPageLink(editor, request, id);
          }}
        >
          <PageLinkBody
            icon={page?.icon}
            kind={kind}
            title={shownTitle}
            muted={status === "missing" || status === "denied"}
            label={LABELS[status]}
          />
        </div>
      </div>
      {props.children}
    </PlateElement>
  );
}
