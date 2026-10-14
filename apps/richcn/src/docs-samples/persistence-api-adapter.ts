import type { EditorPersistenceAdapter } from "@repo/core/components/blocks/notion-like-editor/index";

// The parameter types are inferred from EditorPersistenceAdapter:
// load(documentId: string), save(request: SaveRequest), saveRecovery(snapshot: RecoverySnapshot).
export const apiAdapter: EditorPersistenceAdapter = {
  async load(documentId) {
    const response = await fetch(`/api/documents/${documentId}`, { cache: "no-store" });
    if (response.status === 404) {
      return null; // A new document.
    }
    if (!response.ok) {
      throw new Error("The document could not be loaded.");
    }

    return (await response.json()) as unknown;
  },

  async save(request) {
    const response = await fetch(`/api/documents/${request.documentId}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        schemaVersion: request.schemaVersion,
        baseRevision: request.baseRevision,
        content: request.content,
      }),
    });

    if (response.status === 409) {
      const body = (await response.json()) as { revision: number };
      return { status: "conflict", currentRevision: body.revision };
    }

    if (!response.ok) {
      return { status: "error", reason: "unknown", message: "The document could not be saved." };
    }

    const body = (await response.json()) as { revision: number };
    return { status: "saved", revision: body.revision };
  },

  async saveRecovery(snapshot) {
    // Keep the copy the editor could not save, so the user can recover it later.
    await fetch(`/api/documents/${snapshot.documentId}/recovery`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(snapshot),
    });
  },

  subscribe(documentId, onExternalRevision) {
    // Optional. Report a revision written by another tab or by another user.
    const source = new EventSource(`/api/documents/${documentId}/revisions`);
    source.addEventListener("message", (event) => {
      onExternalRevision(Number(event.data));
    });

    return () => {
      source.close();
    };
  },
};
