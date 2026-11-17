"use client";

import { Button } from "@repo/core/components/button";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";

import { GLASS_PILL } from "@/lib/glass";

const subscribe = () => () => undefined;
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

/** Icon button that flips between light and dark themes. */
export function ThemeToggle() {
  // Resolved theme is only known after mount, so the icon stays empty until then.
  const mounted = useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  let label = "Toggle theme";
  if (mounted) {
    label = isDark ? "Switch to light theme" : "Switch to dark theme";
  }

  return (
    <Button
      variant="outline"
      size="icon"
      className={`${GLASS_PILL} size-10`}
      aria-label={label}
      onClick={() => setTheme(isDark ? "light" : "dark")}
    >
      {mounted ? isDark ? <Sun /> : <Moon /> : null}
    </Button>
  );
}
