import type { Metadata } from "next";
import type { ReactNode } from "react";

import { Footer } from "@repo/core/components/layouts/footer";

const TITLE = "World Cup 2026";
const DESCRIPTION =
  "FIFA World Cup 2026 group tables and full match schedule — Canada, Mexico & USA.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/world-cup" },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: "website",
  },
};

export default function WorldCupLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col">
      {children}
      <Footer />
    </div>
  );
}
