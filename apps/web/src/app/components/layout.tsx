import type { Metadata } from "next";
import type { ReactNode } from "react";

import { Footer } from "@repo/core/components/layouts/footer";

export const metadata: Metadata = {
  title: "Components",
  description: "Handcrafted UI components built for this portfolio.",
  alternates: { canonical: "/components" },
  openGraph: {
    title: "Components",
    description: "Handcrafted UI components built for this portfolio.",
    type: "website",
  },
};

export default function ComponentsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col">
      {children}
      <Footer />
    </div>
  );
}
