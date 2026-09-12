import type { MetadataRoute } from "next";

import { PROJECTS, PUBLIC_PORTFOLIO_URL } from "@repo/core/constants";

const STATIC_ROUTES = [
  { path: "/", priority: 1 },
  { path: "/changelog", priority: 0.5 },
  { path: "/components", priority: 0.7 },
  { path: "/blocks", priority: 0.6 },
  { path: "/world-cup", priority: 0.5 },
  { path: "/blocks/crm-data-table", priority: 0.5 },
  { path: "/blocks/error-page", priority: 0.5 },
  { path: "/components/github-contributions-3d", priority: 0.6 },
  { path: "/components/scroll-minimap", priority: 0.6 },
  { path: "/components/shadcn-tags-input", priority: 0.6 },
  { path: "/components/video-player", priority: 0.6 },
  { path: "/components/zod-data-table", priority: 0.6 },
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    ...STATIC_ROUTES.map(({ path, priority }) => ({
      url: new URL(path, PUBLIC_PORTFOLIO_URL).toString(),
      changeFrequency: "monthly" as const,
      priority,
    })),
    ...PROJECTS.map((project) => ({
      url: new URL(`/projects/${project.slug}`, PUBLIC_PORTFOLIO_URL).toString(),
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
  ];
}
