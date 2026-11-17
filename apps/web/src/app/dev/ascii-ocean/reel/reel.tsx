"use client";

import { useEffect, useRef } from "react";

import { mountReel } from "./timeline";

/** Mounts the frame-driven showreel. `?play=1` previews it live; `?f=` starts at a frame. */
export function Reel() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    return mountReel(root, new URLSearchParams(window.location.search));
  }, []);

  return <div ref={rootRef} />;
}
