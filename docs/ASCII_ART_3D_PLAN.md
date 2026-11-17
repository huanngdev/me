# ASCII Art 3D — plan

Branch `feature/ascii-art-3d`. A new app `apps/ascii-art` that imports the ASCII Ocean component from
`@repo/core`, then draws the same simulation as real three.js meshes and turns them into ASCII with a
shader pass that uses the depth buffer.

Idea and original 2D code: [@stackedlol](https://x.com/stackedlol) — github.com/stackedlol/ascii-sharks.

## 1. Goals and non-goals

Goals

- `apps/ascii-art` is a Next.js 16 app in the monorepo (port **3002**), built the same way as `apps/richcn`.
- `/` shows the existing 2D `AsciiOcean` full screen, imported from `@repo/core` (proves the import).
- `/3d` shows `AsciiOcean3D`: the **same `World` simulation** (steering, spines, bait fish schools,
  pointer flee, splash), drawn as 3D meshes, then rendered as ASCII glyphs where depth drives
  glyph density, fog and edge glyphs.
- All 12 species render with a recognisable 3D body built from their existing `BodyShape` data.

Non-goals (do not build, even if it looks easy)

- No changes to the 2D sim or renderer in `packages/core` (the only core change is one `exports` line, R0).
- No pond environment (lily pads, duckweed), sea surface, wakes, ripples or seabed in 3D. Koi swim in
  the ocean scene only.
- No registry item, no docs page in `apps/web`, no llms output. This is an experiment app.
- No new npm dependency except `three`, `@react-three/fiber` and `@types/three` in the new app
  (core already depends on `three` 0.186 and `@react-three/fiber` 9). No `postprocessing`, no drei.
- No feeding, hunting or jumps (removed in R21; see `docs/ASCII_OCEAN_PLAN.md` §17).

## 2. Architecture

```
World (core, unchanged, 2D px space)        apps/ascii-art/src/ocean3d/
  creatures[].nodes  (20 spine nodes)  ──►  space.ts        px ⇄ three units, depth → Y
  creatures[].phase/turn/depth/speed   ──►  spine.ts        waved spine (same formula as the 2D renderer)
  fish[] x,y,vx,vy,depth,phase         ──►  body.ts         rest geometry per species (s, a, b) + colours
  pointer, splash()                    ◄──  deform.ts       rest (s,a,b) + waved spine → positions
                                            ocean-scene.tsx R3F: meshes, instanced bait fish, lights, fog, snow
                                            ascii-pass.ts   glyph atlas + fullscreen ASCII shader
                                            ascii-ocean-3d.tsx  public component (props like AsciiOcean)
```

### 2.1 Coordinate mapping (`space.ts`)

- The world keeps simulating in CSS px of the canvas (`world.resize(width, height, cw, ch)` with the
  same cell formula as 2D: `cw = clamp(round(width/124), 8, 13)`, `ch = round(cw*1.45)`).
- `UNIT = 100` px per three unit. `X = (x - width/2) / UNIT`, `Z = (y - height/2) / UNIT`.
- `Y = (depth - 1) * DEPTH_RANGE`, `DEPTH_RANGE = 3` units. depth 1 (near/big) sits at Y 0, depth 0 at Y −3.
  Fish depth is 0.55–1, so fish live in Y −1.35…0.
- `toPx(X, Z)` is the exact inverse of the mapping, used for the pointer.

### 2.2 Body model (`body.ts`, `deform.ts`)

Every vertex is stored in **body coordinates** `(s, a, b)`:

- `s` 0 snout → 1 tail tip, `a` sideways in px (+ = right of the swim direction), `b` up in px (+ = back).
- Per frame: `position = P(s) + N(s)·a + UP·b`, where `P(s)` is the waved spine interpolated at `s`,
  `N(s)` its horizontal normal and `UP = (0,1,0)`, then converted to three units.
  One function deforms body and fins alike, so fins follow the body wave for free.

Parts, all generated from the species' `BodyShape` (fractions of length `L`):

| Part                                 | Geometry in (s, a, b)                                                                                                                                                                                                                                                                         |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Body                                 | Loft of `RINGS = 24` rings along s (denser near both ends), `SEGS = 12` around. Ring at s: ellipse with half-width `w = halfWidth(s)·L`, half-height `h = w·HEIGHT[species]`. Closed at the snout and tail with a single vertex.                                                              |
| Dorsal                               | Triangle standing up (`a = 0`): base from `dorsal[0]` to `dorsal[1]` on the back (`b = h`), apex at `s = dorsal[1]` (swept back), height `(dorsal[1]-dorsal[0])·L·DORSAL_H[species]`. Same for `secondDorsal` when its span > 0.                                                              |
| Pectorals                            | Flat triangles at `b = 0`, left and right: roots at `pectoral[0]`, `pectoral[1]` on the body edge, tip at `pectoral[2]`, `a = ±(w + pectoral[3]·L)`, tip drooped `b = -0.25·reach`. `paddle` species use a 4-point rounded paddle instead. Pelvics the same from `pelvic` when its reach > 0. |
| Tail `fluke` (cetaceans)             | Horizontal swept wing at `b = 0`: from `1 - length` to 1, tips at `a = ±span·L` reaching s 1, centre notch at `1 - notch`.                                                                                                                                                                    |
| Tail `caudal` (koi)                  | Vertical blade (`a = 0`) from `1 - length` to 1, half-height `width·L`.                                                                                                                                                                                                                       |
| Shark tail (`caudal > 0`, no `tail`) | Vertical heterocercal fork at s 1: upper lobe `b = +caudal·L·1.3`, lower lobe `b = −caudal·L·0.7`. Zebra (`caudal 0`): the body just tapers.                                                                                                                                                  |
| Hammerhead `head`                    | Flat wing at `b = 0` across the snout, half-span `head.span·L`, tips swept back by `head.sweep·L`, depth `head.depth·L`.                                                                                                                                                                      |
| Eyes                                 | Skip (too small to read at cell size).                                                                                                                                                                                                                                                        |

Defaults: `HEIGHT` 0.8 (sharks), 0.9 (cetaceans), 0.75 (koi); `DORSAL_H` 1.1 (sharks), 0.8 (bottlenose),
2.2 (orca), 0.4 (humpback), 0 for koi. Unknown species fall back to the shark values.

Motion on top of the spine wave (all smooth, no snapping — see the animation smoothness rule):

- Cetacean flukes (`tail.kind === "fluke"`) beat **up and down**: for `s > 0.75`,
  `b += L·0.05·((s-0.75)/0.25)²·sin(phase)`. This is the one thing 2D could not show.
- Bank into turns: roll the cross-section by `bank = clamp(turn·0.45, -0.35, 0.35)` around the spine
  (rotate `(a, b)` by `bank` before adding). Low-pass `bank` per creature with τ 0.3 s.
- Pectoral flap: multiply pectoral `|a|` beyond the body edge by `1 + finFlap·sin(phase·finFlapRate)`.

### 2.3 Waved spine (`spine.ts`)

A copy of the 2D renderer's formula (`renderer.ts` ~line 1180), so 2D and 3D swim identically:
`swim = clamp(speed/60, 0.4, 1.7)`, `amp = L·0.05·(0.1 + 0.9·s^1.8)·swim·undulation`,
`off = amp·sin(phase − s·5.2)`, offset along the node normal. Do not import it from the renderer
(it is a private method); copy it and keep a comment pointing at the source line.

### 2.4 Colours (`body.ts`)

Per-vertex colours, computed once at build time:

- Species with `coats`: call `coat.paint({ s, v: a, L, across: |a|/w on the body (1 on fins), flag, id })`
  for top-half vertices (`b ≥ 0`) and use `regions[index]` through `oklchToRgb` from core `math.ts`.
  `flag` is 3 for fin vertices and 1 for body vertices.
- Underside (`b < 0`): countershading, mix 60% toward a pale belly `oklch(0.9 0.01 240)` (orca:
  pure white belly, region 1).
- Sharks (no coats): grey `oklch(0.58 0.015 240)` multiplied by `shape.tint`, same pale belly.
- `colors="theme"` ignores all of this and draws every animal with the page foreground colour.

### 2.5 Scene (`ocean-scene.tsx`)

- R3F `<Canvas>` with `dpr={[1, 2]}`, `gl={{ antialias: false }}`, a perspective camera, fov 35,
  pitched **60°** down from horizontal, distance chosen so the depth-0 plane covers the canvas height.
- One `<mesh>` per creature: `BufferGeometry` with `position`, `color`, `index`; positions rewritten in
  `useFrame`, then `computeVertexNormals()`. `MeshLambertMaterial({ vertexColors: true, side: DoubleSide })`.
- Bait fish: one `InstancedMesh` (max 600) of a tiny elongated cone (0.12 × 0.03 units), matrix from
  `x, y, atan2(vy, vx), depth`; hidden when `!alive`. Colour pale silver.
- Lights: `hemisphereLight` (sky pale cyan, ground deep blue, 0.6) + `directionalLight` from above (1.2).
- `scene.fog = Fog(bg, near, far)` with near/far set so depth-0 animals are ~50% fogged.
- Marine snow: 400 `points` drifting slowly downward through the volume, wrapping — a depth cue that
  the ASCII pass turns into sparse dots.
- Sim loop in `useFrame`: the same variable substep as `engine.ts` (`STEP = 1/60`, `MAX_STEPS = 4`,
  `dt` capped at 0.1).
- Pointer: `onPointerMove` on the canvas element → px via the canvas rect (same as `engine.ts`
  `toLocal`) — **not** a raycast; the sim's pointer is in canvas px. `onPointerDown` → `world.splash`.
- Pause when off-screen (IntersectionObserver → `frameloop="never"`), and under
  `prefers-reduced-motion` step 240 frames once and render a still (`frameloop="demand"`).

### 2.6 ASCII pass (`ascii-pass.ts`)

Runs in `useFrame(..., 1)` (priority 1 turns off R3F's own render):

1. Render the scene into a `WebGLRenderTarget` (full device size) with a `DepthTexture`.
2. Draw a fullscreen triangle with a `ShaderMaterial` into the screen.

Glyph atlas: a 2D canvas, one row of glyphs `" .:-=+*#%@"` (ramp, 10) followed by `"-/|\\"`
(edges, 4), each cell `cw·dpr × ch·dpr`, drawn in the canvas's `font-family` at `0.92·ch` px,
centred, white on transparent. `CanvasTexture`, `LinearFilter`, no mipmaps. Rebuilt when the cell size,
dpr or font changes.

Fragment shader, per cell (cell = `cw·dpr × ch·dpr` device px, same cell formula as 2D):

- Sample the scene colour and depth at 5 points in the cell (centre + 4 at ±0.3 of the cell).
- `cover` = fraction of samples whose depth < 1 (hit geometry). `cover == 0` → output the background.
- `col` = mean colour of the hit samples; `lum` = Rec.709 luminance of `col`.
- `zLin` = linearised depth of the centre sample (camera near/far uniforms); `fogT = smoothstep(zNear, zFar, zLin)`.
- Glyph level `lvl = clamp(lum·1.5·(1 − 0.65·fogT), 0, 1)`, ramp index `floor(lvl·9 + 0.5)`.
- Edge: if `0 < cover < 1` **or** the depth spread across the 5 samples exceeds `EDGE_DZ` (0.02 in
  linear units), use an edge glyph chosen from the depth gradient direction
  (gradient angle → `-`, `/`, `|`, `\`), at `lvl` alpha.
- Glyph mask from the atlas at the cell-local uv. Output `mix(bg, ink, mask)`, where
  `ink = col` (natural) or `fg·(0.35 + 0.65·lvl)` (theme), then `ink = mix(ink, bg, 0.7·fogT)`.
- Uniform `asciiEnabled` (bool): when false, output the raw scene (debug toggle).

Theme: read `background-color`/`color` of the canvas through core `createPaletteReader`, and re-read on
`<html>` class changes (MutationObserver, same as `engine.ts`).

### 2.7 Public component (`ascii-ocean-3d.tsx`)

```ts
export type AsciiOcean3DProps = {
  creatures?: CreatureGroup[]; // same as AsciiOcean
  baitFish?: number | "auto" | false;
  scale?: OceanScale;
  colors?: OceanColors; // default "natural"
  interaction?: OceanInteraction; // default "splash"
  seed?: number;
  /** Camera pitch in degrees below horizontal, 35–90. Default 60. */
  pitch?: number;
  /** false shows the raw 3D scene (debug). Default true. */
  ascii?: boolean;
  className?: string;
};
```

Roster built exactly like `ascii-ocean.tsx` (`rosterFromGroups` with the `seed ^ 0x9e3779b9` rng).
Props are read once per mount, like `AsciiOcean`, except `pitch`, `ascii` and `colors`, which apply live.

## 3. Files

```
apps/ascii-art/
  package.json  next.config.ts  tsconfig.json  eslint.config.mjs  postcss.config.mjs  prettier.config.mjs
  next-env.d.ts  .gitignore (only if richcn has one)
  src/app/layout.tsx           fonts (Inter + JetBrains Mono), ThemeProvider, core globals.css
  src/app/page.tsx             2D AsciiOcean full screen + link to /3d
  src/app/3d/page.tsx          AsciiOcean3D full screen + dev panel
  src/components/dev-panel.tsx species/count/seed/pitch/ascii/colors controls (R4)
  src/ocean3d/space.ts         + __tests__/space.test.ts
  src/ocean3d/spine.ts         + __tests__/spine.test.ts
  src/ocean3d/body.ts          + __tests__/body.test.ts
  src/ocean3d/deform.ts        + __tests__/deform.test.ts
  src/ocean3d/ocean-scene.tsx
  src/ocean3d/ascii-pass.ts    + __tests__/ascii-pass.test.ts (atlas layout, glyph index maths only)
  src/ocean3d/ascii-ocean-3d.tsx
packages/core/package.json     + "./ascii-ocean/*": "./src/components/ascii-ocean/*.ts"  (only core change)
```

## 4. Rounds

Every round follows the Haiku team workflow: a Haiku **coder** first; then in parallel a Haiku
**reviewer** (diff vs this plan), a Haiku **function tester** (bun test + check-types + lint) and a
Haiku **browser tester** (playwright-core in real Chrome with WebGL — `--use-angle=swiftshader
--enable-unsafe-swiftshader` when headless; screenshots + console errors); then Opus verifies.
Reviewers and testers never edit source. Nothing is committed until the user has reviewed the UI.

### R0 — Scaffold the app

- Create `apps/ascii-art` from `apps/richcn`'s config files (package name `ascii-art`, `dev` on
  port 3002, deps: `@repo/core`, `next`, `next-themes`, `react`, `react-dom`, `three`,
  `@react-three/fiber`; devDeps as richcn plus `@types/three`, `@types/bun`). Same versions as
  the rest of the repo. No analytics, no SEO files, no OG images.
- Add the core export line above.
- `layout.tsx`: core `globals.css`, Inter + JetBrains Mono, core `ThemeProvider`, `<body>` full height.
- `page.tsx`: `<AsciiOcean creatures={[{species:"classic",count:2},{species:"orca",count:2}]} />`
  filling the viewport (`h-dvh`), a small mono link "3d →" top-left, a theme toggle top-right
  (copy richcn's `theme-toggle.tsx`).
- `3d/page.tsx`: placeholder text "3D coming in R2".
- Done when: `bun install` ok; `bun run --filter ascii-art check-types`, `lint`, `build` pass;
  `/` on :3002 shows the moving ocean with no console errors, in both themes.

### R1 — Pure geometry (no React)

- `space.ts`, `spine.ts`, `body.ts`, `deform.ts` as in §2.1–2.4. Pure functions over typed arrays;
  allocate once, write into `out` buffers each frame (no per-frame allocation).
- `body.ts` exports `buildBody(species, L, coat, id) → { rest: Float32Array (s,a,b), color: Float32Array,
index: Uint16Array|Uint32Array, parts }`.
- `deform.ts` exports `deformBody(rest, creature, def, space, state, out)` where `state` keeps the
  low-passed bank.
- Tests (bun test, deterministic): finite positions for all 12 species; vertex count per species is
  stable; body is left/right symmetric at rest (straight spine, phase 0); the snout vertex lands on
  node 0 and the tail tip within 2% of L from the last node; fluke tip `b` follows `sin(phase)`;
  bank is low-passed (one 1/60 s step with turn=1 moves bank < 10% of target); `toPx(toWorld(p)) == p`;
  waved spine matches a hand-computed value for one node.

### R2 — 3D scene without ASCII

- `ocean-scene.tsx` + `ascii-ocean-3d.tsx` with `ascii` forced off; `/3d` renders it full screen.
- Done when: browser tester sees shaded animals swimming, bait fish schools fleeing the cursor,
  splash on click, no console errors, ≥ 50 fps for 16 creatures + default fish in Chrome on this Mac
  (measure with a 5 s rAF counter in `page.evaluate`).

### R3 — ASCII pass

- `ascii-pass.ts` as in §2.6, wired into `ascii-ocean-3d.tsx`, `ascii` default true.
- Done when: screenshots show glyphs only (no smooth shading), near animals dense and bright, far ones
  sparse and fogged, outlines in `- / | \`, both themes correct, `colors="theme"` greyscale,
  resize keeps the cell size formula, fps ≥ 50.

### R4 — Dev panel and polish

- `dev-panel.tsx` on `/3d`: species multi-select with counts, seed, pitch slider, ascii on/off,
  colors natural/theme; changing roster or seed remounts via `key`.
- Off-screen pause, reduced-motion still frame, dpr cap 2, WebGL context loss → render nothing and log once.
- Done when: every control works in the browser test; reduced-motion (emulated) shows a still frame;
  no allocation in `useFrame` (review check).

## 5. Tuned values (R3 review)

Visual tuning moved some numbers away from §2.5–2.6; the code is the source of truth:

- Density: body cells (≥3 of 5 taps hit) `lvl = clamp(0.35 + 0.65·lumS^0.7)·(1 − 0.45·fogT)` with `lumS` in sRGB; 1–2 hit cells are specks capped at `-`; no light-mode inversion.
- Contrast floor 0.3 toward the foreground, fog `0.55·fogT` toward bg, then a 0.12 body floor. Theme ink `fg·(0.45 + 0.55·lvl)`.
- `EDGE_DZ` 0.08; fog from the mean hit distance; lights hemisphere 1.1, directional 2.0; no tone mapping.
- Camera distance `d = (height/UNIT/2)·sin(pitch)/tan(fov/2)` (the plane is foreshortened by the pitch).

## 6. Rules for every round

- Match the surrounding code: comment density, naming, TSDoc on exports, no `any`.
- Only touch the files listed for the round. Do not touch `apps/web`, `apps/richcn`, or anything in
  `packages/core` except the one `exports` line in R0. Never regenerate `apps/web/public/images`.
- Animations ease (no pose or colour snaps in one frame).
- Keep the dev server for `apps/web` on :3000; this app runs on :3002.
- No `--no-verify`, no force-push, commitlint lowercase subjects.

## 7. R5 — Tabs and the compare route (user request 2026-10-22)

- Shared tab nav top-left on every page, core `Tabs` (`@repo/core/components/tabs`), triggers in this order:
  **3d** (`/3d`), **2d** (`/`), **compare** (`/compare`). Active tab follows the pathname; each trigger is a
  real link. It replaces the "3d →" / "← 2d" links.
- `/compare`: no ocean, no tank. A scrolling list, one row per species (all 12, `CREATURE_IDS` order).
  Each row: the species name and its real length on the left, then the 2D `Specimen` (core, `swim`) and the
  3D `Specimen3D` side by side, same size. The animal stays in place and only swims (tail beat, body wave,
  fluke beat, flipper flex) — it never travels.
- `Specimen3D` (`apps/ascii-art/src/ocean3d/specimen-3d.tsx`): one animal posed exactly like core `Specimen`
  (straight spine across the cell, snout right, `L = min(width·0.6, height·1.25)`, speed 40, phase clock
  `2 + 40/24` per second), drawn with `buildBody` + `deformBody` and the same `AsciiPass`, camera pitch 55°.
  3D canvases mount only near the viewport (IntersectionObserver, `rootMargin` 200px) so at most a few
  WebGL contexts are alive.

## 8. R6 — Drop 3D, two tabs: showcase and species (user decision 2026-10-22)

The user judged the three.js look worse than 2D (no colour, depth or detail) and dropped the 3D track.
`apps/ascii-art` stays as a 2D ASCII Ocean showcase. §1–§7 are history.

- Delete `src/ocean3d/` (with its tests), `src/components/{dev-panel,ocean-3d-playground,species-compare,site-tabs}.tsx`,
  `src/app/3d/`, `src/app/compare/`. Remove `three`, `@react-three/fiber`, `@types/three` from the app's
  package.json and run `bun install`. Keep the core `./ascii-ocean/*` export (the app imports `CREATURES`).
- One route `/`. Header top-left: shadcn `Tabs` from `@repo/core/components/tabs`, **default variant**
  (muted pill), triggers **showcase** and **species**; the theme toggle sits right next to the tab list.
  The active tab syncs to `?tab=` (default showcase) so links are shareable.
- **showcase**: a core `Select` (with `Label`) of scene presets, like `apps/web/src/app/components/ascii-ocean/demo.tsx`
  (open ocean, orca pod, humpbacks and dolphins, koi pond, shark gallery), and an `AsciiOcean` filling the
  rest of the viewport, remounted by `key` on preset change.
- **species**: one row per species (`CREATURE_IDS`), then a koi varieties block. Each row: a lazy `Specimen`
  (`swim`, natural colours) and the species info: common name, id, real length, group (shark / dolphin /
  whale / fish), and one factual sentence (from `docs/ascii-ocean-species.md` and the creature files).
