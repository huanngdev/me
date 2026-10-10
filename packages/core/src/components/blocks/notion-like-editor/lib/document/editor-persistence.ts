import type { EditorValue } from "./editor-value";

export type SaveRequest = {
  documentId: string;
  schemaVersion: number;
  baseRevision: number;
  content: EditorValue;
};

export type SaveResult =
  | { status: "saved"; revision: number }
  | { status: "conflict"; currentRevision: number }
  | {
      status: "error";
      reason: "quota" | "unavailable" | "unknown";
      message: string;
    };

export type RecoverySnapshot = {
  documentId: string;
  revision: number;
  savedAt: string;
  content: EditorValue;
  reason: "conflict" | "save-failed" | "replaced-invalid";
  raw?: unknown;
};

export type EditorPersistenceAdapter = {
  load: (documentId: string) => Promise<unknown | null>;
  save: (request: SaveRequest) => Promise<SaveResult>;
  saveRecovery: (snapshot: RecoverySnapshot) => Promise<void>;
  subscribe?: (documentId: string, onExternalRevision: (revision: number) => void) => () => void;
};
