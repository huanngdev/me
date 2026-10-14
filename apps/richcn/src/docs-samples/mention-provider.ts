import type {
  MentionEntity,
  MentionProvider,
} from "@repo/core/components/blocks/notion-like-editor/index";

type PersonRow = { id: string; name: string; email?: string };

function toEntity(row: PersonRow): MentionEntity {
  return {
    entityType: "person",
    entityId: row.id,
    label: row.name,
    email: row.email,
  };
}

export const mentionProvider: MentionProvider = {
  async search(query, signal) {
    const response = await fetch(`/api/people?q=${encodeURIComponent(query)}`, { signal });
    if (!response.ok) {
      return [];
    }

    const rows = (await response.json()) as PersonRow[];
    return rows.map(toEntity);
  },

  // Optional. Without it, a mention shows the label it stored.
  async resolve(entityType, entityId, signal) {
    if (entityType !== "person") {
      return null;
    }

    const response = await fetch(`/api/people/${entityId}`, { signal });
    if (!response.ok) {
      return null;
    }

    return toEntity((await response.json()) as PersonRow);
  },
};
