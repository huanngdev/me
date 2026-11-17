import { CREATURE_IDS, CREATURES } from "@repo/core/ascii-ocean/creatures/index";
import type { CreatureSpecies } from "@repo/core/ascii-ocean/creatures/types";
import { Badge } from "@repo/core/components/badge";

import { KOI_VARIETY_NOTES, SPECIES_INFO, type SpeciesInfo } from "@/lib/species";

import { LazySpecimen } from "./lazy-specimen";

/** The defining body traits of each taxon, shown under every card. */
const TAXON_TRAITS: Record<SpeciesInfo["taxon"], string> = {
  fish: "vertical tail · gills",
  mammal: "horizontal flukes · breathes air",
};

/** One card: the animal swimming in place on top, its name, taxon and traits underneath. */
function SpeciesCard({
  id,
  info,
  length,
  coat,
}: {
  id: CreatureSpecies;
  info: SpeciesInfo;
  length: number;
  coat?: string;
}) {
  return (
    <article className="overflow-hidden rounded-lg border">
      <div className="bg-background h-64">
        <LazySpecimen species={id} coat={coat} colors="natural" swim />
      </div>
      <div className="space-y-1 border-t p-4">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium">{info.name}</p>
          <Badge variant="outline" className="capitalize">
            {info.taxon}
          </Badge>
        </div>
        <p className="text-muted-foreground font-mono text-xs">{id}</p>
        <p className="text-muted-foreground text-xs">
          ≈ {length} m · {info.group}
        </p>
        <p className="text-muted-foreground pt-2 text-sm">{info.note}</p>
        <p className="text-muted-foreground pt-2 text-xs">{TAXON_TRAITS[info.taxon]}</p>
      </div>
    </article>
  );
}

/** Every species the ocean draws as cards, then the koi coats in the same grid. */
export function SpeciesList() {
  return (
    <div className="mx-auto max-w-6xl px-4 pb-16">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {CREATURE_IDS.map((id) => (
          <SpeciesCard key={id} id={id} info={SPECIES_INFO[id]} length={CREATURES[id].realLength} />
        ))}
      </div>

      <h3 className="mt-12 text-sm font-medium">Koi varieties</h3>
      <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {Object.entries(KOI_VARIETY_NOTES).map(([coat, note]) => (
          <SpeciesCard
            key={coat}
            id="koi"
            coat={coat}
            info={{
              name: coat.charAt(0).toUpperCase() + coat.slice(1),
              taxon: "fish",
              group: "fish",
              note,
            }}
            length={CREATURES.koi.realLength}
          />
        ))}
      </div>
    </div>
  );
}
