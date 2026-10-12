// The DOM id is derived from the block id. It is not stored on the node.
export function headingAnchorId(blockId: string): string {
  return `heading-${blockId}`;
}
