"use client";

import { motion, useScroll, useSpring } from "framer-motion";

export function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 120,
    damping: 20,
    mass: 0.2,
  });

  return (
    <div className="bg-background fixed top-0 right-0 left-0 z-50 h-1">
      <motion.div aria-hidden className="size-full origin-left bg-blue-500" style={{ scaleX }} />
    </div>
  );
}
