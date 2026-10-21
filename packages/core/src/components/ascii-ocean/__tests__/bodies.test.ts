import { describe, expect, test } from "bun:test";

import { CREATURE_IDS } from "../creatures";
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
function renderPosed(species: CreatureSpecies) {
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
      sh.nodes[k * 2] = CX + L / 2 - k * seg;
      sh.nodes[k * 2 + 1] = CY;
    }
    renderer.render(world, 1 / 60);
    return calls;
  } finally {
    Reflect.set(globalThis, "document", realDocument);
  }
}

describe("posed bodies", () => {
  test("every species draws at least one cell", () => {
    for (const species of CREATURE_IDS) {
      expect(renderPosed(species).length).toBeGreaterThan(0);
    }
  });

  test("koi's caudal fin is edge-on from above: it reaches the tail tip but stays narrow", () => {
    const calls = renderPosed("koi");
    const tailMin = CX - L / 2;
    const inTail = calls.filter((c) => c.x >= tailMin && c.x <= tailMin + L * 0.1);
    expect(inTail.length).toBeGreaterThan(0);
    expect(inTail.every((c) => Math.abs(c.y - CY) < L * 0.12)).toBe(true);
  });

  // Whale and dolphin flukes are horizontal, so from above they spread across the centre line.
  for (const species of ["bottlenose", "orca", "humpback"] as const) {
    test(`${species} has fins in the last 20% of the body, above and below the centre line`, () => {
      const calls = renderPosed(species);
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
