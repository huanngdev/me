import type { EditorDocument } from "../editor-document";

import { V0_DOCUMENT } from "./v0-document";

export const V1_DOCUMENT = {
  schemaVersion: 1,
  documentId: "doc-golden",
  revision: 0,
  content: V0_DOCUMENT,
} satisfies EditorDocument;
