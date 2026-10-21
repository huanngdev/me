import { PageHeader } from "@repo/core/components/layouts/page-header";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CREATURE_IDS } from "@/components/ascii-ocean/creatures";
import type { CreatureSpecies, OceanColors } from "@/components/ascii-ocean/creatures/types";

import { Theatre } from "./theatre";

export const metadata: Metadata = { robots: { index: false } };

const DEFAULT_SPECIES: CreatureSpecies[] = ["bottlenose", "bottlenose", "bottlenose"];

/** Browser-test page for ASCII Ocean species. Development only; the query string sets the scene. */
export default async function AsciiOceanTheatrePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  const query = await searchParams;

  const species = (query.species ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is CreatureSpecies => (CREATURE_IDS as string[]).includes(s));
  const seed = Number(query.seed);
  const colors: OceanColors = query.colors === "theme" ? "theme" : "natural";

  return (
    <div className="flex flex-1 flex-col">
      <PageHeader backHref="/" title="ASCII Ocean theatre" />
      <Theatre
        species={species.length > 0 ? species : DEFAULT_SPECIES}
        colors={colors}
        fish={query.fish !== "0"}
        seed={Number.isFinite(seed) && query.seed !== undefined ? seed : 7}
      />
    </div>
  );
}
