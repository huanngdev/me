"use client";

import { useSyncExternalStore } from "react";

import { BOOKMARK_TAGS, type BookmarkTag } from "../../constants";

export type BookmarkFilter = BookmarkTag | "all";

const BOOKMARK_TAG_PARAM = "bookmarkTag";
const BOOKMARK_TAG_CHANGE_EVENT = "bookmark-tag-change";

function getBookmarkFilter(): BookmarkFilter {
  if (typeof window === "undefined") return "all";

  const value = new URLSearchParams(window.location.search).get(BOOKMARK_TAG_PARAM);
  return BOOKMARK_TAGS.find((tag) => tag.value === value)?.value ?? "all";
}

function subscribeToBookmarkFilter(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};

  window.addEventListener("popstate", onChange);
  window.addEventListener(BOOKMARK_TAG_CHANGE_EVENT, onChange);

  return () => {
    window.removeEventListener("popstate", onChange);
    window.removeEventListener(BOOKMARK_TAG_CHANGE_EVENT, onChange);
  };
}

function getServerBookmarkFilter(): BookmarkFilter {
  return "all";
}

export function useBookmarkFilter() {
  const activeTag = useSyncExternalStore(
    subscribeToBookmarkFilter,
    getBookmarkFilter,
    getServerBookmarkFilter,
  );

  function setActiveTag(tag: BookmarkFilter): void {
    if (typeof window === "undefined") return;

    const url = new URL(window.location.href);
    if (tag === "all") {
      url.searchParams.delete(BOOKMARK_TAG_PARAM);
    } else {
      url.searchParams.set(BOOKMARK_TAG_PARAM, tag);
    }

    const nextUrl = `${url.pathname}${url.search}${url.hash}`;
    const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (nextUrl === currentUrl) return;

    window.history.pushState(null, "", nextUrl);
    window.dispatchEvent(new Event(BOOKMARK_TAG_CHANGE_EVENT));
  }

  return { activeTag, setActiveTag };
}
