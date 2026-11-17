/** Fish beat their tail side to side and have a vertical caudal fin; mammals beat their flukes up and down and breathe at the surface. */
export type TaxonId = "fish" | "mammal";

/** Traits shared by a whole taxon. Each species keeps its outline and colours and takes these defaults. */
export interface Taxon {
  id: TaxonId;
  /** Plane of the tail beat: side to side (lateral) or up and down (dorsoventral). */
  beat: "lateral" | "dorsoventral";
  /** Whether the animal surfaces to breathe. */
  breathes: boolean;
  /** Side-to-side body wave, used when a species leaves `shape.undulation` unset. */
  undulation: number;
  /** Gill slits along the flank. */
  gillSlits: boolean;
  /** A blowhole on top of the head, where the blow comes out. */
  blowhole: boolean;
}

/**
 * The taxon traits, as data, not subclasses: the sim's hot loop stays on flat arrays and
 * each species differs only in these few values, so one renderer covers every animal.
 */
export const TAXA: Record<TaxonId, Taxon> = {
  fish: {
    id: "fish",
    beat: "lateral",
    breathes: false,
    undulation: 1,
    gillSlits: true,
    blowhole: false,
  },
  mammal: {
    id: "mammal",
    beat: "dorsoventral",
    breathes: true,
    undulation: 0.15,
    gillSlits: false,
    blowhole: true,
  },
};
