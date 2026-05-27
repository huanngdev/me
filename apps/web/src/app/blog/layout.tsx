import type { Metadata } from "next";
import type { ReactNode } from "react";

import { Footer } from "@repo/core/components/layouts/footer";

export const metadata: Metadata = {
  title: "Blog",
  description: "Thoughts on web dev, TypeScript, and building things.",
  alternates: { canonical: "/blog" },
  openGraph: {
    title: "Blog",
    description: "Thoughts on web dev, TypeScript, and building things.",
    type: "website",
  },
};

export default function BlogLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col">
      {children}
      <Footer />
    </div>
  );
}
