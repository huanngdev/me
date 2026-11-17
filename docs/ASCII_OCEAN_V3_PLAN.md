# ASCII Ocean v3 — anatomy, taxa, water colour

Branch `feature/ascii-art-3d` (to be renamed `feature/ascii-art`). Core component:
`packages/core/src/components/ascii-ocean/`. Showcase app: `apps/ascii-art`.
Credit: idea and original code by [@stackedlol](https://x.com/stackedlol) (github.com/stackedlol/ascii-sharks).

## 0. User request (2026-10-22, translated)

1. Use OOP if it is the best option; otherwise whatever is most optimal.
2. Split the 12 species into **fish** and **mammals** and give each class its defining traits.
   Mammals have horizontal flukes and breathe through a blowhole, so they surface now and then to breathe.
   Fish (the sharks, koi) have a **vertical** caudal fin. Today every shark is drawn with a horizontal V tail: wrong.
3. Every animal with a V tail has something poking out between the two lobes, like a bone. It looks bad.
4. The dolphin's fins are not clear.
5. Research scientific sources and fix the appearance of **every** species.
6. The sea does not look real enough. It has no sea colour, and nothing changes when animals rise or dive
   (koi is a bit better). Add water colour plus a colour shift with the animal's depth below the surface.
   The water colour must match the habitat (open sea, fish pond...). More habitats come later.
7. Make the animals on the species tab bigger; two columns is fine.
8. The goal is anatomy and colour that look very real.

## 1. Design decision: OOP or not

**Keep the data-driven `CreatureDef` records and add taxon trait objects (composition). No class
hierarchy for species.**

- The sim's hot loop runs over flat arrays of creatures and `Float32Array` spines every frame. Determinism
  tests hash those buffers. Virtual dispatch per animal adds nothing and makes the sim harder to test.
- What differs between fish and mammals is a handful of **traits**: tail orientation, beat axis, breathing,
  and gill vs blowhole marks. A `Taxon` object (`FISH`, `MAMMAL`) that each `CreatureDef` references
  is the strategy pattern without inheritance. Species keep their own shape data and inherit
  defaults from their taxon.
- The renderer stays one class, `AsciiRenderer`. Tail drawing becomes a switch on `tail.kind`, which is
  already the pattern for `fluke`/`caudal`.

## 2. Rounds

Every round follows the Haiku team workflow:

1. A Haiku coder runs first.
2. In parallel: a Haiku reviewer (the diff against this plan), a function tester (`bun test` in
   `packages/core`, tsc, lint) and a browser tester (playwright-core, real Chrome, port 3002 for
   `apps/ascii-art`, never touch :3000).
3. Opus verifies.

Reviewers and testers never edit source. Nothing is committed until the user has reviewed the UI.

### R7 — Research (Haiku, web)

Output: `docs/ascii-ocean-anatomy.md`. It needs citations: papers, FAO/NOAA species sheets,
Encyclopedia of Life, and measurement studies. No blogs, unless nothing else exists.

- For each of the 12 species, **seen from above (dorsal view)**, give fractions of total length (TL):
  - head shape, and where the maximum width sits plus its value;
  - pectoral fin root position, length and sweep;
  - first dorsal position and base length;
  - pelvic fins, if visible from above;
  - caudal fin: type (heterocercal, homocercal, lunate, flukes), the lobe ratio, and how it looks from above;
  - fluke span, for mammals;
  - colours of back, flank and belly, plus distinctive marks;
  - swimming mode (anguilliform, carangiform, thunniform, or the cetacean dorso-ventral mode), and tail-beat
    frequency, if known.
- For mammals: the typical breathing interval and dive length (bottlenose, orca, humpback), and what the
  blow looks like (humpback: a tall bushy blow; orca and bottlenose: small).
- Water colour, by habitat:
  - the open ocean (Jerlov oceanic types I–III), with the colour of the water column against depth;
  - a koi pond (green, algae, tannins);
  - spectral absorption against depth (red lost first).

  Give sRGB/OKLCH suggestions for surface and deep water, for a dark page and a light page.

- End with a table that maps each finding to the `BodyShape` field it changes, plus the current value
  and the new value (read `creatures/*.ts`).

### R8 — Taxa and tails (core)

- `creatures/taxa.ts`: `type TaxonId = "fish" | "mammal"`, and a `Taxon` interface with these fields:
  - `tailKind`;
  - `beat: "lateral" | "dorsoventral"`;
  - `breathes: boolean`;
  - `undulation` default;
  - `gillSlits: boolean`;
  - `blowhole: boolean`.
- Each `CreatureDef` gets a `taxon` field:
  - fish: the 8 sharks and koi;
  - mammals: bottlenose, orca and humpback.
- The tests assert this classification.
- **Shark tails become vertical.** Add a `TailShape` kind `heterocercal`: a vertical caudal fin seen
  edge-on from above. From above it is a narrow blade behind the peduncle, with the upper lobe
  longer than the body tip. It sweeps side to side with the lateral beat, like the koi `caudal`.
  Its lengths come from R7. Remove the horizontal forked-triangle caudal path at `renderer.ts:1096` for sharks.
  The thresher's very long upper lobe and the zebra's ribbon tail keep their own looks as heterocercal variants.
- **Remove the bone between the fluke lobes.** The body/peduncle must end at the fluke notch, so nothing
  draws past it between the lobes. Apply this to every `fluke` animal. Add a test that no body cell lies
  behind the notch.
- Keep `colors="theme"` looking like the classic cover. Update the determinism hashes deliberately, and
  list in the report which ones changed and why.

### R9 — Anatomy per species (core)

- Apply the R7 table to all 12 `creatures/*.ts` definitions: outlines, fins and coats. Dolphin flippers
  must read clearly: falcate pectorals, with the right position and size.
- Keep stylisation only where a cell grid forces it, and note each one.
- Update the tests that pin shapes (`bodies`, `regions`, `koi-tail`, `cetaceans`).

### R10 — Breathing and depth (core)

- Mammals surface to breathe. Every `breathInterval` (from R7, scaled down for the screen, with
  per-animal jitter from the seeded rng), the animal eases its depth up to the surface over at least 1.5 s.
  It then shows a blow at the blowhole: a short-lived spray of glyphs, tall for the humpback and small for
  the others. It stays up for a few seconds and eases back down.
- Fish drift slowly up and down within their depth band, so their colour changes as they move.
- Every depth change eases with smoothstep. Nothing snaps, following the animation smoothness rule.
- Tests cover these points:
  - the depth change per frame is bounded;
  - only mammals breathe;
  - the breathing schedule is deterministic for a seed.

### R11 — Water colour by habitat (core)

- Natural mode only. The renderer fills the water with a habitat colour: `ocean` deep blue, `pond`
  green-brown, from R7. It is drawn as a vertical-free gradient, using the depth of the water column
  under the swell, and blended toward the page background so it still works on light and dark pages.
- Animals take more absorption and veil the deeper they are: red goes first, then green, so they fade
  into the water colour. The existing `WATER_K`/`POND_WATER_K` tables become per-habitat data in a
  `habitats.ts` module (`OCEAN`, `POND`), ready for more habitats later.
- Theme mode is unchanged.
- Tests:
  - the background colour per habitat;
  - absorption rises with depth;
  - theme-mode hashes are unchanged by this round.

### R12 — Species tab (apps/ascii-art)

- Two columns from `lg` up. Each card holds a bigger specimen (about `h-64`) with its info under it.
- Show the taxon (fish or mammal) and its traits on each card: tail type, breathing.
- Koi varieties use the same card grid.

### R13 — Release chores

- `bun run registry`, `bun run llms`, `registry:check`, `llms:check`, and `bun test` for all of core.
- Check the `apps/web` docs page for the component renders. Do not touch `apps/web/public/images`.
- Update `scripts/llms/catalog.ts` if its description of the component is now wrong.

## 3. Rules

- Read `docs/ASCII_OCEAN_PLAN.md` §17 (deferred list) before touching the sim. No feeding, hunting or
  jumps. The only new motion is breathing and depth drift.
- Only touch the files named for the round.
- Match the surrounding code: comment density, naming, TSDoc on exports, no `any`.
- No new dependencies. No `--no-verify`, no force-push. Commitlint subjects are lowercase.
- English for code and docs strings, except where the user quotes Vietnamese.
