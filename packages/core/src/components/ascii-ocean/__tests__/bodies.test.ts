import { describe, expect, test } from "bun:test";

import { CREATURE_IDS, CREATURES } from "../creatures";
import type { CreatureSpecies } from "../creatures/types";
import { AsciiRenderer } from "../renderer";
import { SPINE_NODES, World } from "../world";

const W = 1200;
const H = 700;
const L = 300;
const CX = W / 2;
const CY = H / 2;

type Call = { kind: "rect" | "text"; x: number; y: number };

/** Renders one posed animal (snout right, tail left, straight across the centre line) and records where it draws. */
function renderPosed(species: CreatureSpecies, W = 1200, H = 700, L = 300) {
  const cx = W / 2;
  const cy = H / 2;
  const realDocument = globalThis.document;
  const calls: Call[] = [];
  const ctx = {
    font: "",
    textAlign: "",
    textBaseline: "",
    strokeStyle: "",
    lineWidth: 0,
    fillStyle: "",
    fillRect(x: number, y: number) {
      calls.push({ kind: "rect", x, y });
    },
    fillText(_text: string, x: number, y: number) {
      calls.push({ kind: "text", x, y });
    },
    drawImage() {},
    setTransform() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    stroke() {},
    clearRect() {},
    createLinearGradient() {
      return { addColorStop() {} };
    },
    createRadialGradient() {
      return { addColorStop() {} };
    },
    getImageData() {
      return null;
    },
  };
  const fakeCanvas = () => ({ width: 0, height: 0, getContext: () => ctx });

  Reflect.set(globalThis, "document", { createElement: () => fakeCanvas() });
  try {
    const renderer = new AsciiRenderer(fakeCanvas() as unknown as HTMLCanvasElement);
    renderer.setFontFamily("monospace");
    renderer.resize(W, H, 1);

    const world = new World({ roster: [{ species, rel: 1, depth: 1 }], baitFish: false, seed: 1 });
    world.resize(W, H, renderer.cellWidth, renderer.cellHeight);
    const sh = world.creatures[0];
    sh.length = L;
    sh.heading = 0;
    sh.speed = 40;
    sh.turn = 0;
    const seg = L / (SPINE_NODES - 1);
    for (let k = 0; k < SPINE_NODES; k++) {
      sh.nodes[k * 2] = cx + L / 2 - k * seg;
      sh.nodes[k * 2 + 1] = cy;
    }
    renderer.render(world, 1 / 60);
    return { calls, cw: renderer.cellWidth, ch: renderer.cellHeight };
  } finally {
    Reflect.set(globalThis, "document", realDocument);
  }
}

describe("posed bodies", () => {
  test("every species draws at least one cell", () => {
    for (const species of CREATURE_IDS) {
      expect(renderPosed(species).calls.length).toBeGreaterThan(0);
    }
  });

  test("koi's caudal fin is edge-on from above: it reaches the tail tip but stays narrow", () => {
    const { calls } = renderPosed("koi");
    const tailMin = CX - L / 2;
    const inTail = calls.filter((c) => c.x >= tailMin && c.x <= tailMin + L * 0.1);
    expect(inTail.length).toBeGreaterThan(0);
    expect(inTail.every((c) => Math.abs(c.y - CY) < L * 0.12)).toBe(true);
  });

  // Whale and dolphin flukes are horizontal, so from above they spread across the centre line.
  for (const species of ["bottlenose", "orca", "humpback"] as const) {
    test(`${species} has fins in the last 20% of the body, above and below the centre line`, () => {
      const { calls } = renderPosed(species);
      // The tail is the left end of the posed body: the last 20% of its x-range.
      const tailMin = CX - L / 2;
      const tailMax = tailMin + L * 0.2;
      const inTail = calls.filter((c) => c.x >= tailMin && c.x <= tailMax);
      const above = inTail.some((c) => c.y < CY - L * 0.05);
      const below = inTail.some((c) => c.y > CY + L * 0.05);
      expect(above).toBe(true);
      expect(below).toBe(true);
    });
  }
});

describe("flipper colour contrast", () => {
  // OKLab lightness difference a flipper cell needs from every body colour it can touch. 0.1 is a clear step in
  // lightness, well above the ~0.02 OKLab difference that reads as one colour.
  const MIN_DELTA_L = 0.1;
  const FIN = 3;
  const BODY = 1;

  /** Lightness of the coat region a point paints; `s` and `across` place it on the body. */
  function regionL(coatRegions: readonly (readonly number[])[], region: number) {
    return coatRegions[region][0];
  }

  test("bottlenose flipper cells differ in lightness from every body region they touch", () => {
    const coat = CREATURES.bottlenose.coats?.bottlenose;
    if (!coat?.paint) throw new Error("bottlenose coat");
    const paint = coat.paint;
    const finRegions = new Set<number>();
    for (const across of [0.2, 0.5, 0.9]) {
      for (const s of [0.15, 0.2, 0.26]) {
        finRegions.add(paint({ s, v: 0, L: 1, across, flag: FIN, id: 1 }));
      }
    }
    const bodyRegions = new Set<number>();
    for (const across of [0.1, 0.5, 0.9]) {
      for (const s of [0.05, 0.2, 0.6]) {
        bodyRegions.add(paint({ s, v: 0, L: 1, across, flag: BODY, id: 1 }));
      }
    }
    expect(finRegions.size).toBeGreaterThanOrEqual(2);
    for (const f of finRegions) {
      for (const b of bodyRegions) {
        const dL = Math.abs(regionL(coat.regions, f) - regionL(coat.regions, b));
        expect(dL).toBeGreaterThanOrEqual(MIN_DELTA_L);
      }
    }
  });

  test("orca's flipper rim is lighter than the black body it outlines", () => {
    const coat = CREATURES.orca.coats?.orca ?? null;
    // The orca coat is unnamed: it is the species default, so look it up through defaultCoat.
    const named = CREATURES.orca.coats;
    const orca = named && CREATURES.orca.defaultCoat ? named[CREATURES.orca.defaultCoat] : coat;
    if (!orca?.paint) throw new Error("orca coat");
    const rim = orca.paint({ s: 0.2, v: 0, L: 1, across: 0.95, flag: FIN, id: 1 });
    const body = orca.paint({ s: 0.2, v: 0, L: 1, across: 0.3, flag: BODY, id: 1 });
    expect(rim).not.toBe(body);
    expect(
      Math.abs(regionL(orca.regions, rim) - regionL(orca.regions, body)),
    ).toBeGreaterThanOrEqual(MIN_DELTA_L);
  });
});

describe("flippers at the species-tab size", () => {
  // Species tab: L 330 px and 12 × 17 px cells (a 1500 px wide canvas gives a 12 px cell width).
  const TAB_W = 1500;
  const TAB_H = 900;
  const TAB_L = 330;
  // Two rows by two columns at least, so a flipper reads as a swept wedge rather than a bump on the outline.
  // The falcate flipper measures 6–7 cells per side at this size.
  const MIN_FIN_CELLS = 4;

  for (const species of ["bottlenose", "orca"] as const) {
    test(`${species}: the flipper reaches at least 3 cells past the body edge`, () => {
      const { calls, cw, ch } = renderPosed(species, TAB_W, TAB_H, TAB_L);
      const cx = TAB_W / 2;
      const cy = TAB_H / 2;
      const def = CREATURES[species];
      let furthest = 0;
      for (const c of calls) {
        const col = Math.floor(c.x / cw);
        const row = Math.floor(c.y / ch);
        const s = (cx + TAB_L / 2 - (col + 0.5) * cw) / TAB_L;
        if (s < 0.1 || s > 0.5) continue;
        const dy = Math.abs((row + 0.5) * ch - cy);
        furthest = Math.max(furthest, dy - def.shape.halfWidth(s) * TAB_L);
      }
      expect(furthest / ch).toBeGreaterThanOrEqual(3);
    });
  }

  test(`each side shows at least ${MIN_FIN_CELLS} flipper cells whose centres lie outside the body`, () => {
    const { calls, cw, ch } = renderPosed("bottlenose", TAB_W, TAB_H, TAB_L);
    expect(cw).toBe(12);
    expect(ch).toBe(17);
    const cx = TAB_W / 2;
    const cy = TAB_H / 2;
    const def = CREATURES.bottlenose;
    // Distinct cells, keyed by column and row, split by side of the centre line.
    const above = new Set<string>();
    const below = new Set<string>();
    for (const c of calls) {
      const col = Math.floor(c.x / cw);
      const row = Math.floor(c.y / ch);
      // The snout is at the right, so s runs from 0 (right) to 1 (left) along the body.
      const s = (cx + TAB_L / 2 - (col + 0.5) * cw) / TAB_L;
      // The flipper band: past the snout's melon, before the tail stock.
      if (s < 0.1 || s > 0.5) continue;
      const dy = (row + 0.5) * ch - cy;
      if (Math.abs(dy) <= def.shape.halfWidth(s) * TAB_L) continue;
      (dy < 0 ? above : below).add(`${col},${row}`);
    }
    expect(above.size).toBeGreaterThanOrEqual(MIN_FIN_CELLS);
    expect(below.size).toBeGreaterThanOrEqual(MIN_FIN_CELLS);
  });
});
