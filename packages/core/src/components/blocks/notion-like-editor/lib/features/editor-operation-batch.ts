// Operations that edit text inside a block or move the caret. None of them adds,
// removes or moves a block, so a block's position in the document is unchanged.
const TEXT_OPERATIONS = new Set<string>(["insert_text", "remove_text", "set_selection"]);

// True when no operation in the batch can change which blocks exist or where
// they sit. Typing and caret moves are text-only; everything else is structural.
export function isTextOnlyBatch(operations: readonly { type: string }[]): boolean {
  return operations.every((operation) => TEXT_OPERATIONS.has(operation.type));
}
