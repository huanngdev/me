import { Suspense } from "react";

import { getViewsData } from "../../../lib/get-views-data";
import { RecordView } from "./record-view";
import { ViewsChart, ViewsChartFallback } from "./views-chart";

export function ViewsSection({
  recordAction,
}: {
  recordAction: () => Promise<{ counted: boolean }>;
}) {
  const data = getViewsData();

  return (
    <section id="views">
      <div className="mx-auto max-w-4xl border-x">
        <Suspense fallback={<ViewsChartFallback />}>
          <ViewsChart data={data} />
        </Suspense>
      </div>
      <RecordView action={recordAction} />
    </section>
  );
}
