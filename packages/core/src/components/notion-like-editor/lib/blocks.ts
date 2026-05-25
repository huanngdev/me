import type { BlockType } from "../types";

let idCounter = 0;

export function nextId() {
  return `block-${++idCounter}`;
}

export function blockPlaceholder(type: BlockType): string {
  switch (type) {
    case "heading1":
      return "Heading 1";
    case "heading2":
      return "Heading 2";
    case "bullet-list":
      return "List item";
    default:
      return "Type '/' for commands...";
  }
}
