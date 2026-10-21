import { Badge } from "@repo/core/components/badge";
import {
  COMPONENT_COUNT,
  ComponentsSection,
} from "@repo/core/components/layouts/components-section";
import { Footer } from "@repo/core/components/layouts/footer";
import { PageHeader } from "@repo/core/components/layouts/page-header";
import type { Metadata } from "next";

import { COMPONENT_PREVIEWS } from "./previews";

const description = "Handcrafted UI components built for this portfolio.";

export const metadata: Metadata = {
  title: "Components",
  description,
  alternates: { canonical: "/components" },
  openGraph: {
    title: "Components",
    description,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Components",
    description,
  },
};

export default function ComponentsPage() {
  return (
    <div className="flex flex-1 flex-col">
      <PageHeader
        backHref="/"
        title={
          <>
            Components
            <Badge variant="secondary" className="font-mono tabular-nums">
              {COMPONENT_COUNT}
            </Badge>
          </>
        }
      />
      <article className="mx-auto flex w-full max-w-4xl flex-1 flex-col border-x">
        <ComponentsSection previews={COMPONENT_PREVIEWS} />
      </article>
      <Footer />
    </div>
  );
}
