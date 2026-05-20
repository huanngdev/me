"use client";

import { motion, useMotionValue, useSpring } from "framer-motion";
import { useRef } from "react";

import { DotPattern } from "../dot-pattern";

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
        className="relative mx-auto flex h-72 max-w-4xl items-center justify-center overflow-hidden border-x px-4 sm:h-80 sm:px-6 lg:px-8"
      >
        <DotPattern />
        <motion.div
          style={{ x, y }}
          className="pointer-events-none relative flex items-center justify-center"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/logo-black.svg"
            alt="Ngo Gia Huan"
            className="block h-8 w-auto sm:h-12 dark:hidden"
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/logo-white.svg"
            alt="Ngo Gia Huan"
            className="hidden h-8 w-auto sm:h-12 dark:block"
          />
        </motion.div>
      </div>
    </section>
  );
}
