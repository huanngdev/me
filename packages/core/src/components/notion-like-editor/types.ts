export type BlockType = "paragraph" | "heading1" | "heading2" | "bullet-list";

export interface Block {
  id: string;
  type: BlockType;
  html: string;
}
