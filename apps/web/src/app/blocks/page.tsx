import { Badge } from "@repo/core/components/badge";
import { BLOCK_COUNT, BlocksSection } from "@repo/core/components/layouts/blocks-section";
import { Footer } from "@repo/core/components/layouts/footer";
import { PageHeader } from "@repo/core/components/layouts/page-header";
import type { Metadata } from "next";

const description = "Full-page UI blocks designed and built for the web.";

export const metadata: Metadata = {
  title: "Blocks",
  description,
  alternates: { canonical: "/blocks" },
  openGraph: {
    title: "Blocks",
    description,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Blocks",
    description,
  },
};

export default function BlocksPage() {
  return (
    <div className="flex flex-1 flex-col">
      <PageHeader
        backHref="/"
        title={
          <>
            Blocks
            <Badge variant="secondary" className="font-mono tabular-nums">
              {BLOCK_COUNT}
            </Badge>
          </>
        }
      />
      <article className="mx-auto flex w-full max-w-4xl flex-1 flex-col border-x">
        <BlocksSection />
      </article>
      <Footer />
    </div>
  );
}
