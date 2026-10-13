export const LIST_SIBLING_GAP_CLASS = "[&>[data-list-item]:has(+[data-list-item])]:mb-1";

export function todoTextId(blockId: string): string {
  return `todo-text-${blockId}`;
}
