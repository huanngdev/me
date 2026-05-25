import { ComponentsSection } from "@repo/core/components/layouts/components-section";
import { PageHeader } from "@repo/core/components/layouts/page-header";

export default function ComponentsPage() {
  return (
    <>
      <PageHeader title="Components" />
      <article className="mx-auto flex w-full max-w-4xl flex-1 flex-col border-x">
        <ComponentsSection />
      </article>
    </>
  );
}
