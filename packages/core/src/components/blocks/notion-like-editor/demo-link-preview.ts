import type { LinkPreview, LinkPreviewAdapter } from "./editor-bookmark-url";

const DEMO_PREVIEW_DELAY_MS = 400;

const FIXTURES: Record<string, LinkPreview> = {
  "https://platejs.org/docs": {
    title: "Plate",
    description: "The rich-text editor framework for React.",
    siteName: "Plate",
    imageUrl: "/blocks/notion-like-editor/bookmark-demo.svg",
  },
  "https://github.com/udecode/plate": {
    title: "udecode/plate",
    description: "The rich-text editor framework for React.",
    siteName: "GitHub",
    imageUrl: "/blocks/notion-like-editor/bookmark-demo.svg",
  },
};

export const demoLinkPreviewAdapter: LinkPreviewAdapter = {
  fetchPreview(url, signal) {
    return wait(DEMO_PREVIEW_DELAY_MS, signal).then(() => fixtureFor(url));
  },
};

function fixtureFor(url: string): LinkPreview | null {
  return FIXTURES[url] ?? null;
}

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(abortError());
      return;
    }

    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(abortError());
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function abortError(): Error {
  const error = new Error("The operation was aborted.");
  error.name = "AbortError";
  return error;
}
