"use client";

import { useEffect, useRef, useState } from "react";

import { Specimen, type SpecimenProps } from "@repo/core/components/ascii-ocean/specimen";

/** A Specimen that is only mounted while it is near the viewport, so off-screen species draw no frames. */
export function LazySpecimen(props: SpecimenProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), {
      rootMargin: "200px 0px",
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className="size-full">
      {visible && <Specimen {...props} />}
    </div>
  );
}
