import type { ReactNode } from "react";

import { cn } from "@repo/core/lib/utils";

import { DocsMobileNav, DocsSidebar } from "@/components/docs/docs-nav";
import { CONTENT_SHELL_CLASS } from "@/lib/layout";

/** The docs shell: the sidebar and the content column, inside the header's width. */
export default function DocsLayout({ children }: { children: ReactNode }) {
  return (
    <div className={cn(CONTENT_SHELL_CLASS, "flex-1 py-10 sm:py-14")}>
      <div className="lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-12">
        <DocsSidebar />
        <div className="min-w-0">
          <DocsMobileNav />
          <div className="max-w-[700px] min-w-0">{children}</div>
        </div>
      </div>
    </div>
  );
}
