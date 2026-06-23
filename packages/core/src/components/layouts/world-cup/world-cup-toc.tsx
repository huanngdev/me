"use client";

import { TOCMinimap, type TOCItemType } from "../../toc-minimap";

const SECTIONS: TOCItemType[] = [
  { title: "Schedule", url: "#schedule", depth: 2 },
  { title: "Groups", url: "#groups", depth: 2 },
];

export function WorldCupToc() {
  return (
    <div
      aria-label="Section navigation"
      className="pointer-events-none fixed top-1/2 right-4 z-30 hidden -translate-y-1/2 xl:block"
    >
      <div className="pointer-events-auto">
        <TOCMinimap items={SECTIONS} />
      </div>
    </div>
  );
}
