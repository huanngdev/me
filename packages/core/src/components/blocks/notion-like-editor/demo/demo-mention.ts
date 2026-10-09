import type { MentionEntity, MentionProvider } from "../lib/features/editor-mention-node";

const DEMO_PEOPLE: readonly MentionEntity[] = [
  {
    entityType: "person",
    entityId: "person-alex-kim",
    label: "Alex Kim",
    email: "alex.kim@example.com",
  },
  {
    entityType: "person",
    entityId: "person-alex-kim-2",
    label: "Alex Kim",
    email: "alex.kim.studio@example.com",
  },
  {
    entityType: "person",
    entityId: "person-ngo-gia",
    label: "Ngô Gia",
    email: "gia@example.com",
  },
  {
    entityType: "person",
    entityId: "person-tran-mai",
    label: "Trần Mai",
    email: "mai@example.com",
  },
  {
    entityType: "person",
    entityId: "person-lena-ortiz",
    label: "Lena Ortiz",
    email: "lena@example.com",
  },
  {
    entityType: "person",
    entityId: "person-minh-pham",
    label: "Minh Phạm",
    email: "minh@example.com",
  },
];

function fold(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("en");
}

function abortError(): Error {
  const error = new Error("The mention search was aborted.");
  error.name = "AbortError";
  return error;
}

function matches(person: MentionEntity, query: string): boolean {
  if (query.length === 0) {
    return true;
  }

  const label = fold(person.label);
  const email = fold(person.email ?? "");
  return label.includes(query) || email.includes(query);
}

export const demoMentionProvider: MentionProvider = {
  search(query, signal) {
    if (signal.aborted) {
      return Promise.reject(abortError());
    }

    const folded = fold(query.trim());
    return Promise.resolve(DEMO_PEOPLE.filter((person) => matches(person, folded)));
  },
  resolve(entityType, entityId, signal) {
    if (signal.aborted) {
      return Promise.reject(abortError());
    }

    const found = DEMO_PEOPLE.find(
      (person) => person.entityType === entityType && person.entityId === entityId,
    );
    return Promise.resolve(found ?? null);
  },
};
