const MARKS = [
  "bold",
  "italic",
  "underline",
  "strikethrough",
  "code",
  "superscript",
  "subscript",
  "color",
  "backgroundColor",
  "fontSize",
  "fontFamily",
] as const;

type TextNode = Record<string, unknown> & { text?: string };

function sameText(left: TextNode, right: TextNode): boolean {
  if (typeof left.text !== "string" || typeof right.text !== "string") {
    return false;
  }

  if ("type" in left || "type" in right) {
    return false;
  }

  return MARKS.every((mark) => left[mark] === right[mark]);
}

export function mergeInlineText<T extends TextNode>(nodes: readonly T[]): T[] {
  const merged: T[] = [];
  for (const node of nodes) {
    const previous = merged[merged.length - 1];
    if (previous !== undefined && sameText(previous, node)) {
      previous.text = `${previous.text ?? ""}${node.text ?? ""}`;
      continue;
    }

    merged.push({ ...node });
  }

  return merged;
}
