import { describe, expect, test } from "bun:test";

import { isTextOnlyBatch } from "../lib/features/editor-operation-batch";

describe("text-only operation batches", () => {
  test("typing and caret moves are text-only", () => {
    expect(isTextOnlyBatch([{ type: "insert_text" }])).toBe(true);
    expect(isTextOnlyBatch([{ type: "remove_text" }, { type: "insert_text" }])).toBe(true);
    expect(isTextOnlyBatch([{ type: "set_selection" }])).toBe(true);
  });

  test("an empty batch changes nothing and is text-only", () => {
    expect(isTextOnlyBatch([])).toBe(true);
  });

  test("any block-level operation makes the batch structural", () => {
    for (const type of [
      "insert_node",
      "remove_node",
      "move_node",
      "split_node",
      "merge_node",
      "set_node",
    ]) {
      expect(isTextOnlyBatch([{ type: "insert_text" }, { type }])).toBe(false);
    }
  });
});
