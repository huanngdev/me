"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

import { Safari } from "../safari";

type BlockUrlContextValue = {
  search: string;
  setSearch: (search: string) => void;
};

const BlockUrlContext = createContext<BlockUrlContextValue>({
  search: "",
  setSearch: () => {},
});

/**
 * Shares the current query string between a block and the Safari frame that
 * renders it. The block owns `window.history`; this provider only mirrors the
 * search string into the Safari address bar.
 */
export function BlockUrlProvider({ children }: { children: ReactNode }) {
  const [search, setSearch] = useState("");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync the frame with the initial URL on mount
    setSearch(window.location.search);
  }, []);

  return (
    <BlockUrlContext.Provider value={{ search, setSearch }}>{children}</BlockUrlContext.Provider>
  );
}

export function useBlockUrl() {
  return useContext(BlockUrlContext);
}

export function SafariPreview({
  baseUrl,
  className,
  children,
}: {
  baseUrl: string;
  className?: string;
  children: ReactNode;
}) {
  const { search } = useBlockUrl();

  return (
    <Safari url={`${baseUrl}${search}`} className={className}>
      {children}
    </Safari>
  );
}
