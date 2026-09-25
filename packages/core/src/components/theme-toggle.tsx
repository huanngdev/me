"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

import { clickSoftSound } from "../lib/click-soft";
import { playSound } from "../lib/sound-engine";
import { Button } from "./button";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    // Mount gate prevents SSR/CSR aria-label mismatch with next-themes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  const iconTheme = mounted && resolvedTheme === "dark" ? "dark" : "light";
  const nextTheme = iconTheme === "dark" ? "light" : "dark";
  const icon = iconTheme === "dark" ? "sun" : "moon";

  function toggleTheme() {
    void playSound(clickSoftSound.dataUri, { volume: 0.5 }).catch(() => {});
    setTheme(nextTheme);
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      onClick={toggleTheme}
      aria-label={mounted ? `Switch to ${nextTheme} theme` : "Toggle theme"}
      aria-pressed={iconTheme === "dark"}
      title={mounted ? `Switch to ${nextTheme} theme` : "Toggle theme"}
    >
      <AnimatePresence initial={false} mode="wait">
        <motion.span
          key={icon}
          aria-hidden="true"
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, rotate: -15, scale: 0.35 }}
          animate={reduceMotion ? { opacity: 1 } : { opacity: 1, rotate: 0, scale: 1 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, rotate: 15, scale: 0.35 }}
          transition={reduceMotion ? { duration: 0 } : { duration: 0.2, ease: "easeOut" }}
          className="flex size-4 items-center justify-center"
        >
          {icon === "sun" ? <Sun /> : <Moon />}
        </motion.span>
      </AnimatePresence>
      <span className="sr-only">Toggle theme</span>
    </Button>
  );
}
