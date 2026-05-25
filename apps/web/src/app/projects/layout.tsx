import type { Metadata } from "next";
import type { ReactNode } from "react";

import { Footer } from "@repo/core/components/layouts/footer";

export const metadata: Metadata = {
  title: "Projects",
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
