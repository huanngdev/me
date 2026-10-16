import { Badge } from "@repo/core/components/badge";
import {
  COMPONENT_COUNT,
  ComponentsSection,
} from "@repo/core/components/layouts/components-section";
import { PageHeader } from "@repo/core/components/layouts/page-header";

import { COMPONENT_PREVIEWS } from "./previews";

export default function ComponentsPage() {
  return (
    <>
      <PageHeader
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
    </>
  );
}
