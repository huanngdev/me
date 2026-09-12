import type { Metadata } from "next";
import type { ReactNode } from "react";

import { Footer } from "@repo/core/components/layouts/footer";
import { IDENTITY } from "@repo/core/constants";

export const metadata: Metadata = {
  title: {
    default: "Projects",
    template: `%s — Project by ${IDENTITY.fullName}`,
  },
  description: "Personal and open-source projects.",
};

export default function ProjectsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col">
      {children}
      <Footer />
    </div>
  );
}
