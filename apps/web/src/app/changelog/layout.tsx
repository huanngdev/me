import type { Metadata } from "next";
import type { ReactNode } from "react";

import { Footer } from "@repo/core/components/layouts/footer";

export const metadata: Metadata = {
  title: "Changelog",
  description: "Big shipping milestones for this portfolio — newest first.",
  alternates: { canonical: "/changelog" },
  openGraph: {
    title: "Changelog",
    description: "Big shipping milestones for this portfolio — newest first.",
    type: "article",
  },
};

export default function ChangelogLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col">
      {children}
      <Footer />
    </div>
  );
}
