import { createContext, useContext, useSyncExternalStore, type ReactNode } from "react";

import { Kbd, KbdGroup } from "@/components/kbd";

import { useEditorOptions } from "../../hooks/use-editor-options";
import {
  EDITOR_SHORTCUTS,
  formatShortcutKeys,
  shortcutPlatformOf,
  type EditorShortcutId,
  type ShortcutPlatform,
} from "../../lib/features/editor-shortcuts";

const FINE_POINTER = "(any-pointer: fine)";
const HOVER = "(any-hover: hover)";

function mediaList(query: string): MediaQueryList | null {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return null;
  }

  return window.matchMedia(query);
}

// A device with no fine pointer and no hover is touch-only, and shows no hints.
// Without matchMedia, the device is treated as a keyboard device.
function getSnapshot(): ShortcutPlatform | null {
  const fine = mediaList(FINE_POINTER);
  const hover = mediaList(HOVER);
  if (fine === null || hover === null) {
    return shortcutPlatformOf(navigator);
  }

  return fine.matches || hover.matches ? shortcutPlatformOf(navigator) : null;
}

function subscribe(onChange: () => void): () => void {
  const lists = [mediaList(FINE_POINTER), mediaList(HOVER)];
  for (const list of lists) {
    list?.addEventListener("change", onChange);
  }

  return () => {
    for (const list of lists) {
      list?.removeEventListener("change", onChange);
    }
  };
}

// The editor's shortcutHints option. A component outside an editor has no option,
// so its hints stay on.
const ShortcutHintsContext = createContext(true);

// Sits inside Plate, so the hints of every component in the editor follow the option.
export function ShortcutHintsScope({ children }: { children: ReactNode }) {
  const { shortcutHints } = useEditorOptions();
  return (
    <ShortcutHintsContext.Provider value={shortcutHints}>{children}</ShortcutHintsContext.Provider>
  );
}

// null on the server and in the first client render, so both render the same markup.
// null also when the editor turns hints off, which hides every hint and aria-keyshortcuts.
export function useShortcutPlatform(): ShortcutPlatform | null {
  const hints = useContext(ShortcutHintsContext);
  const platform = useSyncExternalStore(subscribe, getSnapshot, () => null);
  return hints ? platform : null;
}

// The hint keys, one Kbd per key. Renders nothing on touch-only devices.
export function ShortcutKbd({ id }: { id: EditorShortcutId }) {
  const platform = useShortcutPlatform();
  if (platform === null) {
    return null;
  }

  return (
    <KbdGroup>
      {formatShortcutKeys(EDITOR_SHORTCUTS[id], platform).map((label, index) => (
        <Kbd key={`${index}-${label}`}>{label}</Kbd>
      ))}
    </KbdGroup>
  );
}

// A tooltip line: the label, then its shortcut hint with a small gap.
export function ShortcutLabel({ label, shortcut }: { label: string; shortcut: EditorShortcutId }) {
  return (
    <span className="inline-flex items-center gap-2">
      {label}
      <ShortcutKbd id={shortcut} />
    </span>
  );
}
