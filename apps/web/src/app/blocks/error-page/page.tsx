import { readFileSync } from "node:fs";
import path from "node:path";

import { ErrorPageBlock } from "@repo/core/components/blocks/error-page-block";
import { BlockPreviewFrame } from "@repo/core/components/layouts/block-preview-frame";
import { Blocks, House } from "lucide-react";
import type { Metadata } from "next";

const REPO_ROOT = process.cwd().endsWith("apps/web")
  ? path.resolve(process.cwd(), "../..")
  : process.cwd();

const BLOCK_FILES = [
  {
    path: "components/blocks/error-page-block.tsx",
    code: readFileSync(
      path.join(REPO_ROOT, "packages/core/src/components/blocks/error-page-block.tsx"),
      "utf8",
    ),
  },
  {
    path: "app/blocks/error-page/page.tsx",
    code: readFileSync(path.join(REPO_ROOT, "apps/web/src/app/blocks/error-page/page.tsx"), "utf8"),
  },
];

const description = "A minimal fullscreen error page with clear recovery actions.";

export const metadata: Metadata = {
  title: "Minimal Error Page Block",
  description,
  alternates: { canonical: "/blocks/error-page" },
  openGraph: {
    title: "Minimal Error Page Block",
    description,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Minimal Error Page Block",
    description,
  },
};

export default function ErrorPageBlockPage() {
  return (
    <BlockPreviewFrame
      name="error-page"
      files={BLOCK_FILES}
      backButton={{ label: "Go back", position: "top-left" }}
    >
      <ErrorPageBlock
        code={500}
        message="Something went wrong."
        description="The server could not complete your request. Try again or return to safety."
        actions={[
          { label: "Go home", href: "/", icon: House },
          {
            label: "View blocks",
            href: "/blocks",
            icon: Blocks,
            appearance: "outline",
          },
        ]}
        backButton={false}
        className="h-full min-h-0"
      />
    </BlockPreviewFrame>
  );
}
