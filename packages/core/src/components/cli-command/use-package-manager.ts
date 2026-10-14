"use client";

import { useSyncExternalStore } from "react";

import { isPackageManager, type PackageManager } from "./package-managers";

const STORAGE_KEY = "package-manager";
const CHANGE_EVENT = "package-manager-change";

function readStored(): PackageManager | null {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return isPackageManager(value) ? value : null;
  } catch {
    return null;
  }
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

/**
 * The selected package manager, shared by every `CliCommand` on the page and across browser tabs.
 * The server renders the default so the first paint matches the markup.
 */
export function usePackageManager(
  defaultManager: PackageManager,
): [PackageManager, (manager: PackageManager) => void] {
  const manager = useSyncExternalStore(
    subscribe,
    () => readStored() ?? defaultManager,
    () => defaultManager,
  );

  const setManager = (next: PackageManager): void => {
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Storage can be blocked; the in-page event still updates every command.
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  };

  return [manager, setManager];
}
