import type { LinkPreviewAdapter } from "@repo/core/components/blocks/notion-like-editor/index";

// The editor never fetches the URL itself. This endpoint does, and it answers with
// { title?, description?, siteName?, imageUrl? }.
export const previewAdapter: LinkPreviewAdapter = {
  async fetchPreview(url, signal) {
    const response = await fetch(`/api/link-preview?url=${encodeURIComponent(url)}`, { signal });
    if (!response.ok) {
      return null;
    }

    return (await response.json()) as {
      title?: string;
      description?: string;
      siteName?: string;
      imageUrl?: string;
    };
  },
};
