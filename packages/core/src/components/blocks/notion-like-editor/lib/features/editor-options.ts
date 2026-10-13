import { DEFAULT_AUTOSAVE_DEBOUNCE_MS } from "../document/editor-autosave";
import {
  BLOCK_HANDLE_ANCHOR_CENTER_MAX,
  BLOCK_HANDLE_CENTER_MAX,
  BLOCK_HANDLE_GAP,
} from "./editor-block-handle";

// What a host passes. Every field is optional, and a missing or invalid field
// takes its default. See README.md, "Options".
export type EditorOptions = {
  handle?: { gap?: number; centerMax?: number; anchorCenterMax?: number };
  autosave?: { debounceMs?: number };
  shortcutHints?: boolean;
  appendOnTailClick?: boolean;
};

export type ResolvedEditorOptions = {
  handle: { gap: number; centerMax: number; anchorCenterMax: number };
  autosave: { debounceMs: number };
  shortcutHints: boolean;
  appendOnTailClick: boolean;
};

export const DEFAULT_EDITOR_OPTIONS: ResolvedEditorOptions = {
  handle: {
    gap: BLOCK_HANDLE_GAP,
    centerMax: BLOCK_HANDLE_CENTER_MAX,
    anchorCenterMax: BLOCK_HANDLE_ANCHOR_CENTER_MAX,
  },
  autosave: { debounceMs: DEFAULT_AUTOSAVE_DEBOUNCE_MS },
  shortcutHints: true,
  appendOnTailClick: true,
};

// A number is used only when it is finite and not negative.
function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function flagOr(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

// Fills every field, so the result is complete and safe to read. Values that
// are not valid are replaced by the default for that field.
export function resolveEditorOptions(options?: EditorOptions): ResolvedEditorOptions {
  const defaults = DEFAULT_EDITOR_OPTIONS;
  return {
    handle: {
      gap: numberOr(options?.handle?.gap, defaults.handle.gap),
      centerMax: numberOr(options?.handle?.centerMax, defaults.handle.centerMax),
      anchorCenterMax: numberOr(options?.handle?.anchorCenterMax, defaults.handle.anchorCenterMax),
    },
    autosave: {
      debounceMs: numberOr(options?.autosave?.debounceMs, defaults.autosave.debounceMs),
    },
    shortcutHints: flagOr(options?.shortcutHints, defaults.shortcutHints),
    appendOnTailClick: flagOr(options?.appendOnTailClick, defaults.appendOnTailClick),
  };
}

// Two resolved values with the same fields have the same key. The fields are
// listed in a fixed order, so the key does not depend on object key order.
export function editorOptionsKey(resolved: ResolvedEditorOptions): string {
  return JSON.stringify([
    resolved.handle.gap,
    resolved.handle.centerMax,
    resolved.handle.anchorCenterMax,
    resolved.autosave.debounceMs,
    resolved.shortcutHints,
    resolved.appendOnTailClick,
  ]);
}
