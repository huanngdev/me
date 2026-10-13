import { describe, expect, test } from "bun:test";

import * as entry from "../index";
import {
  DEFAULT_EDITOR_OPTIONS,
  DEFAULT_PLACEHOLDER,
  EMPTY_EDITOR_VALUE,
  NotionLikeEditorBlock,
  NotionLikeEditorStatic,
  createLocalStorageAdapter,
} from "../index";

describe("public entry point", () => {
  test("each runtime export is defined", () => {
    expect(NotionLikeEditorBlock).toBeDefined();
    expect(NotionLikeEditorStatic).toBeDefined();
    expect(EMPTY_EDITOR_VALUE).toBeDefined();
    expect(DEFAULT_EDITOR_OPTIONS).toBeDefined();
    expect(DEFAULT_PLACEHOLDER).toBeDefined();
    expect(createLocalStorageAdapter).toBeDefined();
  });

  test("it exports only the runtime names a host needs", () => {
    expect(Object.keys(entry).sort()).toEqual(
      [
        "DEFAULT_EDITOR_FEATURES",
        "DEFAULT_EDITOR_OPTIONS",
        "DEFAULT_PLACEHOLDER",
        "EDITOR_FEATURES",
        "EMPTY_EDITOR_VALUE",
        "NotionLikeEditorBlock",
        "NotionLikeEditorStatic",
        "createLocalStorageAdapter",
      ].sort(),
    );
  });
});
