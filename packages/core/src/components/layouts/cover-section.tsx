"use client";

import { motion, useReducedMotion } from "framer-motion";

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

export function CoverSection() {
  const reduceMotion = useReducedMotion();

  return (
    <section className="border-b">
      <div className="relative mx-auto flex h-72 w-full max-w-4xl items-center justify-center overflow-hidden border-x px-4 sm:h-80 sm:px-6 lg:px-8">
        <DotPattern className="absolute inset-0 h-full w-full opacity-50" />
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, scale: 1.02 }}
          animate={reduceMotion ? undefined : { opacity: 1, scale: 1 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="pointer-events-none absolute inset-0 flex items-center justify-center"
        >
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
        </motion.div>
      </div>
    </section>
  );
}
