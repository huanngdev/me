import { EDITOR_SHORTCUTS, type EditorShortcutId } from "../lib/features/editor-shortcuts";

// A keydown built from a registry entry. Mod is Meta on macOS and Ctrl elsewhere. The fields
// cover what the hand-written handlers and Plate's hotkey matcher read.
export type SyntheticKey = {
  key: string;
  code: string;
  keyCode: number;
  which: number;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  isComposing: boolean;
  readonly defaultPrevented: boolean;
  preventDefault: () => void;
  stopPropagation: () => void;
};

const NAMED: Record<string, { key: string; code: string; keyCode: number }> = {
  Enter: { key: "Enter", code: "Enter", keyCode: 13 },
  Escape: { key: "Escape", code: "Escape", keyCode: 27 },
  Backspace: { key: "Backspace", code: "Backspace", keyCode: 8 },
  ArrowUp: { key: "ArrowUp", code: "ArrowUp", keyCode: 38 },
  ArrowDown: { key: "ArrowDown", code: "ArrowDown", keyCode: 40 },
  Slash: { key: "/", code: "Slash", keyCode: 191 },
  semicolon: { key: ";", code: "Semicolon", keyCode: 186 },
  period: { key: ".", code: "Period", keyCode: 190 },
  comma: { key: ",", code: "Comma", keyCode: 188 },
  Backslash: { key: "\\", code: "Backslash", keyCode: 220 },
  BracketLeft: { key: "[", code: "BracketLeft", keyCode: 219 },
  BracketRight: { key: "]", code: "BracketRight", keyCode: 221 },
};

function keyFor(token: string): { key: string; code: string; keyCode: number } {
  const named = NAMED[token];
  if (named) {
    return named;
  }
  if (/^[a-z]$/.test(token)) {
    return {
      key: token,
      code: `Key${token.toUpperCase()}`,
      keyCode: token.toUpperCase().charCodeAt(0),
    };
  }
  if (/^[0-9]$/.test(token)) {
    return { key: token, code: `Digit${token}`, keyCode: token.charCodeAt(0) };
  }

  throw new Error(`No synthetic key for ${token}.`);
}

export function syntheticKey(keys: readonly string[], mac: boolean): SyntheticKey {
  let prevented = false;
  const event = {
    key: "",
    code: "",
    keyCode: 0,
    which: 0,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    isComposing: false,
    get defaultPrevented() {
      return prevented;
    },
    preventDefault() {
      prevented = true;
    },
    stopPropagation() {},
  };

  for (const token of keys) {
    if (token === "Mod") {
      event.metaKey = mac;
      event.ctrlKey = !mac;
    } else if (token === "Alt") {
      event.altKey = true;
    } else if (token === "Shift") {
      event.shiftKey = true;
    } else {
      const found = keyFor(token);
      event.key = found.key;
      event.code = found.code;
      event.keyCode = found.keyCode;
      event.which = found.keyCode;
    }
  }

  return event;
}

export function syntheticRegistryKey(id: EditorShortcutId, mac: boolean): SyntheticKey {
  return syntheticKey(EDITOR_SHORTCUTS[id], mac);
}

// The init for a real KeyboardEvent, for component tests that dispatch one.
export function keyboardInit(keys: readonly string[], mac: boolean): KeyboardEventInit {
  const event = syntheticKey(keys, mac);
  return {
    key: event.key,
    code: event.code,
    metaKey: event.metaKey,
    ctrlKey: event.ctrlKey,
    altKey: event.altKey,
    shiftKey: event.shiftKey,
  };
}
