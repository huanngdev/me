import type { PageEntity, PageProvider, PageResolution } from "../lib/features/editor-page-link";

// Fixture pages for the demo. page-notes-2 repeats a title on purpose, and page-private is denied.
const DEMO_PAGES: readonly PageEntity[] = [
  { pageId: "page-roadmap", title: "Roadmap", icon: "🗺️" },
  { pageId: "page-notes", title: "Meeting notes", icon: "📝" },
  { pageId: "page-release", title: "Release checklist", icon: "✅" },
  { pageId: "page-design", title: "Design system" },
  { pageId: "page-notes-2", title: "Meeting notes" },
];

const DENIED_PAGE_IDS: readonly string[] = ["page-private"];

function abortError(): Error {
  const error = new Error("The page search was aborted.");
  error.name = "AbortError";
  return error;
}

function fold(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("en");
}

export const demoPageProvider: PageProvider = {
  search(query, signal) {
    if (signal.aborted) {
      return Promise.reject(abortError());
    }

    const needle = fold(query.trim());
    return Promise.resolve(
      DEMO_PAGES.filter((page) => needle.length === 0 || fold(page.title).includes(needle)),
    );
  },
  resolve(pageId, signal) {
    if (signal.aborted) {
      return Promise.reject(abortError());
    }

    if (DENIED_PAGE_IDS.some((id) => id === pageId)) {
      return Promise.resolve<PageResolution>({ status: "denied" });
    }

    const found = DEMO_PAGES.find((page) => page.pageId === pageId);
    if (found === undefined) {
      return Promise.resolve<PageResolution>({ status: "missing" });
    }

    return Promise.resolve<PageResolution>({ status: "ok", page: found });
  },
};
