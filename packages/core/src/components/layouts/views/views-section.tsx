import { Suspense } from "react";

import { getViewsData } from "../../../lib/get-views-data";
import { RecordView } from "./record-view";
import { SeedButton } from "./seed-button";
import { ViewsChart, ViewsChartFallback } from "./views-chart";

export function ViewsSection({
  recordAction,
  seedAction,
}: {
  recordAction: () => Promise<{ counted: boolean }>;
  seedAction?: () => Promise<{ inserted: number }>;
}) {
  const data = getViewsData();
  const showSeed = process.env.NODE_ENV === "development" && seedAction;

  return (
    <section id="views">
      <div className="mx-auto max-w-4xl border-x">
        <div className="flex items-center justify-between border-b px-4 py-4 sm:px-6 sm:py-5 lg:px-8">
          <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">Portfolio Views</h2>
          {showSeed && <SeedButton action={seedAction} />}
        </div>
        <Suspense fallback={<ViewsChartFallback />}>
          <ViewsChart data={data} />
        </Suspense>
      </div>
      <RecordView action={recordAction} />
    </section>
  );
}
