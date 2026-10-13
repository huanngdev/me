import { Badge } from "@repo/core/components/badge";
import { BLOCK_COUNT, BlocksSection } from "@repo/core/components/layouts/blocks-section";
import { Footer } from "@repo/core/components/layouts/footer";
import { PageHeader } from "@repo/core/components/layouts/page-header";
import type { Metadata } from "next";

import { RegistryInstall, RegistryNamespace } from "@/components/registry-install";
import { REGISTRY_NAMESPACE, registryBlocks } from "@/lib/registry-install";

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
        <section className="border-t p-6">
          <h2 className="text-sm font-medium">Install</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Each block installs with one shadcn command. Blocks use Radix-based shadcn components.
          </p>
          <div className="mt-6 space-y-8">
            {registryBlocks().map((block) => (
              <div key={block.name} className="space-y-3">
                <h3 className="text-sm font-medium">{block.title}</h3>
                <RegistryInstall name={block.name} compact />
              </div>
            ))}
          </div>
          <div className="mt-8 space-y-3">
            <RegistryNamespace />
            <p className="text-muted-foreground text-sm">
              Then install a block by name:{" "}
              {registryBlocks()
                .map((block) => `${REGISTRY_NAMESPACE}/${block.name}`)
                .join(", ")}
              .
            </p>
          </div>
        </section>
      </article>
      <Footer />
    </div>
  );
}
