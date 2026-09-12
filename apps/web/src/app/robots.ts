import type { MetadataRoute } from "next";

import { PUBLIC_PORTFOLIO_URL } from "@repo/core/constants";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: `${PUBLIC_PORTFOLIO_URL}/sitemap.xml`,
    host: PUBLIC_PORTFOLIO_URL,
  };
}
