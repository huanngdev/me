"use client";

import { Button } from "@repo/core/components/button";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";

const subscribe = () => () => undefined;
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

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
      size="icon-sm"
      aria-label={label}
      onClick={() => setTheme(isDark ? "light" : "dark")}
    >
      {mounted ? isDark ? <Sun /> : <Moon /> : null}
    </Button>
  );
}
