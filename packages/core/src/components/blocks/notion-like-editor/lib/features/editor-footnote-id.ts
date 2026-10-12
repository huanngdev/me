import { nanoid } from "platejs";

// A footnote id links a reference to its definition. Numbers are never stored, so the id is the only key.
const FOOTNOTE_ID = /^[A-Za-z0-9_-]{1,64}$/;

export function isFootnoteId(value: unknown): value is string {
  return typeof value === "string" && FOOTNOTE_ID.test(value);
}

// Same generator and length as the block ids the validator assigns.
export function createFootnoteId(): string {
  return nanoid(10);
}
