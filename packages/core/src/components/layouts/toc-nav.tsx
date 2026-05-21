"use client";

import { TOCMinimap, type TOCItemType } from "../toc-minimap";

const SECTIONS: TOCItemType[] = [
  { title: "Profile", url: "#profile", depth: 2 },
  { title: "Overview", url: "#overview", depth: 2 },
  { title: "Links", url: "#links", depth: 2 },
  { title: "Coding", url: "#coding", depth: 2 },
  { title: "Projects", url: "#projects", depth: 2 },
  { title: "Experience", url: "#experience", depth: 2 },
  { title: "Education", url: "#education", depth: 2 },
  { title: "Certifications", url: "#certifications", depth: 2 },
  { title: "Awards", url: "#awards", depth: 2 },
];

export function TocNav() {
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
