"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";

import { cn } from "../lib/utils";
import { squarify, toPercentages } from "./tile-treemap.utils";

export type TileTreemapItem = {
  label: string;
  value: number;
  color?: string;
};

export type TileTreemapProps = {
  data: TileTreemapItem[];
  height?: number;
  className?: string;
  valueFormatter?: (value: number, percentage: number) => string;
  hoverScale?: number;
};

const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
  "var(--chart-7)",
  "var(--chart-8)",
];

const DEFAULT_ASPECT_RATIO = "16 / 10";
const LABEL_MIN_WIDTH = 64;
const LABEL_MIN_HEIGHT = 40;
const PERCENT_MIN_WIDTH = 48;
const PERCENT_MIN_HEIGHT = 28;

export function TileTreemap({
  data,
  height,
  className,
  valueFormatter,
  hoverScale = 1.01,
}: TileTreemapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const observer = new ResizeObserver(() => {
      setSize((current) =>
        current.width === element.clientWidth && current.height === element.clientHeight
          ? current
          : { width: element.clientWidth, height: element.clientHeight },
      );
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const { rects, percentages } = useMemo(() => {
    const values = data.map((item) => item.value);
    return {
      rects: squarify(values, size.width, size.height),
      percentages: toPercentages(values),
    };
  }, [data, size.width, size.height]);

  if (data.length === 0 || !data.some((item) => item.value > 0)) {
    return (
      <div
        className={cn(
          "bg-muted/40 text-muted-foreground flex min-h-40 items-center justify-center rounded-lg border text-sm",
          className,
        )}
      >
        No data to display.
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={cn("relative w-full", className)}
      style={height ? { height } : { aspectRatio: DEFAULT_ASPECT_RATIO }}
    >
      {size.width > 0 &&
        size.height > 0 &&
        data.map((item, index) => {
          const rect = rects[index];
          if (!rect || rect.width <= 0 || rect.height <= 0) return null;

          const percentage = percentages[index] ?? 0;
          const color = item.color ?? CHART_COLORS[index % CHART_COLORS.length];
          const formatted = valueFormatter
            ? valueFormatter(item.value, percentage)
            : `${percentage.toFixed(1)}%`;
          const showLabel = rect.width >= LABEL_MIN_WIDTH && rect.height >= LABEL_MIN_HEIGHT;
          const showPercentage =
            rect.width >= PERCENT_MIN_WIDTH && rect.height >= PERCENT_MIN_HEIGHT;

          return (
            <motion.div
              key={`${item.label}-${index}`}
              aria-label={`${item.label}: ${item.value} (${percentage.toFixed(1)}%)`}
              className="group absolute p-1 focus-visible:outline-none"
              role="img"
              style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
              tabIndex={0}
              initial={reduceMotion ? false : { opacity: 0, scale: 0.92 }}
              animate={{
                opacity: 1,
                scale: 1,
                transition: {
                  duration: 0.3,
                  ease: [0.22, 1, 0.36, 1],
                  delay: Math.min(index, 12) * 0.03,
                },
              }}
              whileHover={
                reduceMotion ? undefined : { scale: hoverScale, transition: { duration: 0.18 } }
              }
              whileFocus={
                reduceMotion ? undefined : { scale: hoverScale, transition: { duration: 0.18 } }
              }
            >
              <div
                className="group-focus-visible:ring-ring/60 flex size-full flex-col justify-end overflow-hidden rounded-lg p-2 transition-[filter] duration-150 ease-out group-hover:brightness-110 group-focus-visible:ring-2"
                style={{ backgroundColor: color }}
              >
                {showLabel && (
                  <span className="text-background truncate text-xs font-medium">{item.label}</span>
                )}
                {showPercentage && (
                  <span className="text-background/80 font-mono text-[11px] tabular-nums">
                    {formatted}
                  </span>
                )}
              </div>
            </motion.div>
          );
        })}
    </div>
  );
}
