import { Suspense } from "react";

import { AsciiArtTabs } from "@/components/ascii-art-tabs";

/** The ASCII Ocean experiment: showcase and species tabs under one header. */
export default function Home() {
  return (
    <main className="w-full">
      <Suspense fallback={null}>
        <AsciiArtTabs />
      </Suspense>
    </main>
  );
}
