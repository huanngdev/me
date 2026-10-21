import { Specimen } from "@repo/core/components/ascii-ocean/specimen";
import { PageHeader } from "@repo/core/components/layouts/page-header";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Fragment, type CSSProperties } from "react";

// Not from the specimen module: that one is "use client", so a list exported from it is a client reference here.
import { CREATURE_IDS, CREATURES } from "@/components/ascii-ocean/creatures";

export const metadata: Metadata = { robots: { index: false } };

/** One row per species, and one per coat for species that have coats (koi: kohaku, sanke, ...). */
const ROWS = CREATURE_IDS.flatMap((id): { id: typeof id; coat?: string; label: string }[] => {
  const coats = CREATURES[id].coats;
  if (!coats) return [{ id, label: id }];
  return Object.keys(coats).map((coat) => ({ id, coat, label: `${id} · ${coat}` }));
});

/** Light cell: pins the page colours so the sheet reads the same whatever the site theme is. */
const LIGHT_VARS = {
  "--background": "oklch(1 0 0)",
  "--foreground": "oklch(0.145 0 0)",
} as CSSProperties;

/** Every species and koi variety, in light and dark, each animal swimming in place. Development only. */
export default function AsciiOceanSpecimensPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <div className="flex flex-1 flex-col">
      <PageHeader backHref="/" title="ASCII Ocean specimens" />
      <article className="mx-auto flex w-full max-w-4xl flex-1 flex-col border-x">
        <div className="grid grid-cols-[6rem_minmax(0,1fr)_minmax(0,1fr)]">
          {ROWS.map(({ id, coat, label }) => (
            <Fragment key={label}>
              <div className="flex items-center border-b px-4 font-mono text-sm">{label}</div>
              <div className="h-44 border-b" style={LIGHT_VARS}>
                <Specimen species={id} coat={coat} colors="natural" swim />
              </div>
              <div className="dark h-44 border-b">
                <Specimen species={id} coat={coat} colors="natural" swim />
              </div>
            </Fragment>
          ))}
        </div>
      </article>
    </div>
  );
}
