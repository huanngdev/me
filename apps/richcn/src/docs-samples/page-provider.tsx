"use client";

import { useRouter } from "next/navigation";

import {
  NotionLikeEditorBlock,
  type PageEntity,
  type PageOpenRequest,
  type PageProvider,
} from "@repo/core/components/blocks/notion-like-editor/index";

const pageProvider: PageProvider = {
  async search(query, signal) {
    const response = await fetch(`/api/pages?q=${encodeURIComponent(query)}`, { signal });
    if (!response.ok) {
      return [];
    }

    return (await response.json()) as PageEntity[];
  },

  async resolve(pageId, signal) {
    const response = await fetch(`/api/pages/${encodeURIComponent(pageId)}`, { signal });
    if (response.status === 404) {
      return { status: "missing" };
    }
    if (response.status === 403) {
      return { status: "denied" };
    }
    if (!response.ok) {
      return { status: "missing" };
    }

    return { status: "ok", page: (await response.json()) as PageEntity };
  },
};

export function DocEditor({ pageId }: { pageId: string }) {
  const router = useRouter();

  const openPage = (request: PageOpenRequest) => {
    router.push(`/pages/${encodeURIComponent(request.pageId)}`);
  };

  return (
    <NotionLikeEditorBlock documentId={pageId} pageProvider={pageProvider} onOpenPage={openPage} />
  );
}
