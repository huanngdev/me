"use client";

import { motion, useMotionValue, useSpring } from "framer-motion";
import { useRef } from "react";

import { DottedMap, type Marker } from "../dotted-map";
import { DotPattern } from "../dot-pattern";

type HcmcMarker = Marker & {
  overlay: { label: string };
};

const HCMC_MARKER: HcmcMarker[] = [
  {
    lat: 10.7769,
    lng: 106.7009,
    size: 0.6,
    pulse: true,
    overlay: { label: "Ho Chi Minh City" },
  },
];

const MAX_OFFSET = 24;
const SPRING = { stiffness: 150, damping: 18, mass: 0.6 } as const;

export function CoverSection() {
  const ref = useRef<HTMLDivElement>(null);
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const x = useSpring(mouseX, SPRING);
  const y = useSpring(mouseY, SPRING);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const dx = (e.clientX - rect.left) / rect.width - 0.5;
    const dy = (e.clientY - rect.top) / rect.height - 0.5;
    mouseX.set(dx * MAX_OFFSET * 2);
    mouseY.set(dy * MAX_OFFSET * 2);
  };

  const handleMouseLeave = () => {
    mouseX.set(0);
    mouseY.set(0);
  };

  return (
    <section className="border-b">
      <div
        ref={ref}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        className="relative mx-auto flex h-72 w-full max-w-4xl items-center justify-center overflow-hidden border-x px-4 sm:h-80 sm:px-6 lg:px-8"
      >
        <DotPattern className="absolute inset-0 h-full w-full opacity-50" />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <DottedMap<HcmcMarker>
            markers={HCMC_MARKER}
            markerColor="#22c55e"
            className="text-muted-foreground/50 h-full w-full p-4"
            dotRadius={0.4}
            renderMarkerOverlay={({ marker, x: mx, y: my, r }) => {
              const { label } = marker.overlay;
              const fontSize = r * 5;
              const badgeH = fontSize * 1.8;
              const padX = fontSize * 0.9;
              const badgeW = label.length * (fontSize * 0.62) + padX * 2;
              const badgeX = mx + r + r * 4;
              const badgeY = my - badgeH / 2;

              return (
                <g
                  style={{
                    pointerEvents: "none",
                    filter:
                      "drop-shadow(0 10px 15px rgba(0,0,0,0.1)) drop-shadow(0 4px 6px rgba(0,0,0,0.1))",
                  }}
                >
                  <rect
                    x={badgeX}
                    y={badgeY}
                    width={badgeW}
                    height={badgeH}
                    rx={badgeH / 2}
                    fill="var(--secondary)"
                    stroke="var(--border)"
                    strokeWidth={0.3}
                  />
                  <text
                    x={badgeX + padX}
                    y={my + fontSize * 0.36}
                    fontSize={fontSize}
                    fill="var(--secondary-foreground)"
                    fontFamily="var(--font-mono), ui-monospace, monospace"
                    fontWeight={500}
                    letterSpacing={fontSize * 0.02}
                    style={{ userSelect: "none", whiteSpace: "pre" }}
                  >
                    {label}
                  </text>
                </g>
              );
            }}
          />
        </div>
        <motion.div
          style={{ x, y }}
          className="pointer-events-none relative flex items-center justify-center"
        >
          <div aria-hidden className="absolute" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/logo-black.svg"
            alt="Ngo Gia Huan"
            className="relative block h-8 w-auto sm:h-12 dark:hidden"
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/logo-white.svg"
            alt="Ngo Gia Huan"
            className="relative hidden h-8 w-auto sm:h-12 dark:block"
          />
        </motion.div>
      </div>
    </section>
  );
}
