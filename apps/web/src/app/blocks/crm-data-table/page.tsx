import { readFileSync } from "node:fs";
import path from "node:path";

import { CrmDataTableBlock } from "@repo/core/components/blocks/crm-data-table/crm-data-table-block";
import { BlockPreviewFrame } from "@repo/core/components/layouts/block-preview-frame";
import type { Metadata } from "next";

import { generateCrmCustomers } from "./data";

const REPO_ROOT = process.cwd().endsWith("apps/web")
  ? path.resolve(process.cwd(), "../..")
  : process.cwd();

function readSource(relativePath: string): string {
  return readFileSync(path.join(REPO_ROOT, relativePath), "utf8");
}

const BLOCK_DIR = "packages/core/src/components/blocks/crm-data-table";
const ROUTE_DIR = "apps/web/src/app/blocks/crm-data-table";

const BLOCK_FILES = [
  {
    path: "components/blocks/crm-data-table/crm-data-table-block.tsx",
    code: readSource(`${BLOCK_DIR}/crm-data-table-block.tsx`),
  },
  {
    path: "components/blocks/crm-data-table/crm-data-table-toolbar.tsx",
    code: readSource(`${BLOCK_DIR}/crm-data-table-toolbar.tsx`),
  },
  {
    path: "components/blocks/crm-data-table/crm-data-table-pagination.tsx",
    code: readSource(`${BLOCK_DIR}/crm-data-table-pagination.tsx`),
  },
  {
    path: "components/blocks/crm-data-table/crm-data-table.tsx",
    code: readSource(`${BLOCK_DIR}/crm-data-table.tsx`),
  },
  {
    path: "components/blocks/crm-data-table/crm-data-table-columns.tsx",
    code: readSource(`${BLOCK_DIR}/crm-data-table-columns.tsx`),
  },
  {
    path: "components/blocks/crm-data-table/crm-data-table-filter.tsx",
    code: readSource(`${BLOCK_DIR}/crm-data-table-filter.tsx`),
  },
  {
    path: "components/blocks/crm-data-table/crm-data-table-row-detail.tsx",
    code: readSource(`${BLOCK_DIR}/crm-data-table-row-detail.tsx`),
  },
  {
    path: "components/blocks/crm-data-table/crm-data-table-format.ts",
    code: readSource(`${BLOCK_DIR}/crm-data-table-format.ts`),
  },
  {
    path: "components/blocks/crm-data-table/crm-data-table-features.ts",
    code: readSource(`${BLOCK_DIR}/crm-data-table-features.ts`),
  },
  {
    path: "components/blocks/crm-data-table/use-crm-table.ts",
    code: readSource(`${BLOCK_DIR}/use-crm-table.ts`),
  },
  {
    path: "components/blocks/crm-data-table/types.ts",
    code: readSource(`${BLOCK_DIR}/types.ts`),
  },
  {
    path: "app/blocks/crm-data-table/page.tsx",
    code: readSource(`${ROUTE_DIR}/page.tsx`),
  },
  {
    path: "app/blocks/crm-data-table/data.ts",
    code: readSource(`${ROUTE_DIR}/data.ts`),
  },
];

const description =
  "A CRM customers table with faceted filters, sorting, selection, expandable rows, row pinning, and column controls.";

export const metadata: Metadata = {
  title: "CRM Data Table Block",
  description,
  alternates: { canonical: "/blocks/crm-data-table" },
  openGraph: {
    title: "CRM Data Table Block",
    description,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "CRM Data Table Block",
    description,
  },
};

export default function CrmDataTableBlockPage() {
  const data = generateCrmCustomers(80);

  return (
    <BlockPreviewFrame
      name="crm-data-table"
      url="huanngdev.site/blocks/crm-data-table"
      files={BLOCK_FILES}
      backButton={{ label: "Go back", position: "top-left" }}
    >
      <CrmDataTableBlock data={data} />
    </BlockPreviewFrame>
  );
}
