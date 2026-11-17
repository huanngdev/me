import { describe, expect, test } from "bun:test";

import { CREATURE_IDS, CREATURES } from "../creatures";
import type { CreatureSpecies } from "../creatures/types";
import type { SharkKind } from "../world";
import { TAXA } from "../creatures/taxa";
import { AsciiRenderer } from "../renderer";
import { SPINE_NODES, World } from "../world";

const FISH: CreatureSpecies[] = [
  "classic",
  "hammerhead",
  "tiger",
  "zebra",
  "greathammer",
  "mako",
  "thresher",
  "nurse",
  "koi",
];
const MAMMALS: CreatureSpecies[] = ["bottlenose", "orca", "humpback"];
/** Sharks by kind: every fish species except koi. */
const SHARKS = CREATURE_IDS.filter(
  (id): id is SharkKind => CREATURES[id].taxon === "fish" && id !== "koi",
);

describe("taxa", () => {
  test("every species is classed: the 8 sharks and koi are fish, the cetaceans mammals", () => {
    expect(CREATURE_IDS.length).toBe(12);
    for (const id of FISH) expect(CREATURES[id].taxon).toBe("fish");
    for (const id of MAMMALS) expect(CREATURES[id].taxon).toBe("mammal");
  });

  test("fish beat laterally and have gill slits; mammals beat dorsoventrally and breathe", () => {
    expect(TAXA.fish.beat).toBe("lateral");
    expect(TAXA.fish.gillSlits).toBe(true);
    expect(TAXA.mammal.beat).toBe("dorsoventral");
    expect(TAXA.mammal.breathes).toBe(true);
    expect(TAXA.mammal.blowhole).toBe(true);
  });

  test("every shark has a heterocercal tail, and no shark keeps the forked caudal", () => {
    expect(SHARKS.length).toBe(8);
    for (const id of SHARKS) {
      expect(CREATURES[id].shape.tail?.kind).toBe("heterocercal");
    }
    // Only koi use the caudal blade; no species keeps the old horizontal forked tail.
    for (const id of CREATURE_IDS) {
      if (id !== "koi") expect(CREATURES[id].shape.tail?.kind).not.toBe("caudal");
    }
  });
});

const W = 1200;
const H = 700;
const L = 300;
const CX = W / 2;
const CY = H / 2;

/** A renderer after one render of one posed animal, so its spine and tail frame are current. */
function posed(species: CreatureSpecies, phase = 0) {
  const realDocument = globalThis.document;
  const ctx = {
    font: "",
    textAlign: "",
    textBaseline: "",
    strokeStyle: "",
    lineWidth: 0,
    fillStyle: "",
    fillRect() {},
    fillText() {},
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
    sh.phase = phase;
    const seg = L / (SPINE_NODES - 1);
    for (let k = 0; k < SPINE_NODES; k++) {
      sh.nodes[k * 2] = CX + L / 2 - k * seg;
      sh.nodes[k * 2 + 1] = CY;
    }
    renderer.render(world, 1 / 60);
    return renderer as unknown as {
      sampleBody(px: number, py: number, L: number): boolean;
      cw: number;
      ch: number;
      def: { shape: { tail?: { kind: string } } };
    } & { halfFlag: Uint8Array; cols: number; hitFlag: number };
  } finally {
    Reflect.set(globalThis, "document", realDocument);
  }
}

/** The renderer's fin flag (FLAG_FIN in renderer.ts). */
const FLAG_FIN = 3;

describe("fluke notch", () => {
  for (const species of MAMMALS) {
    test(`${species}: no body between the flukes, on the centre line and off it`, () => {
      const r = posed(species);
      const tail = CREATURES[species].shape.tail;
      if (!tail || tail.kind !== "fluke") throw new Error("expected a fluke");
      // The tail tip is at x = CX - L/2; the notch sits `notch` of L in from it.
      const tip = CX - L / 2;
      for (const off of [0, 0.05, -0.05, 0.1, -0.1]) {
        for (let f = 0.1; f < 0.95; f += 0.1) {
          const x = tip + tail.notch * L * f;
          const y = CY + off * L;
          // Past the notch a hit may only be the fluke itself (a fin), never the body.
          if (r.sampleBody(x, y, L)) expect(r.hitFlag).toBe(FLAG_FIN);
        }
      }
    });
  }
});

describe("heterocercal blade", () => {
  /** Cells (column, row) in the blade: past the body tip, which sits at x = CX + L/2 - (1 - upper) L. */
  function bladeCells(species: CreatureSpecies, phase: number) {
    const r = posed(species, phase);
    const tail = CREATURES[species].shape.tail as { kind: "heterocercal"; upper: number };
    const bodyTip = CX + L / 2 - (1 - tail.upper) * L;
    const cells: { x: number; y: number }[] = [];
    // The blade is a few px wide, so sample densely across it.
    for (let x = CX - L / 2 + 1; x < bodyTip; x += 2) {
      for (let y = CY - L * 0.2; y < CY + L * 0.2; y += 1) {
        if (r.sampleBody(x, y, (1 - tail.upper) * L)) cells.push({ x, y });
      }
    }
    return { cells, bodyTip };
  }

  for (const species of SHARKS) {
    test(`${species}: the blade lies behind the body and is thin at rest`, () => {
      const { cells } = bladeCells(species, 0);
      expect(cells.length).toBeGreaterThan(0);
      const tail = CREATURES[species].shape.tail as { width: number };
      const ch = posed(species).ch;
      const maxOff = Math.max(...cells.map((c) => Math.abs(c.y - CY)));
      expect(maxOff).toBeLessThanOrEqual(tail.width * L + ch);
    });

    test(`${species}: the blade sweeps side to side with the beat`, () => {
      const centre = (phase: number) => {
        const { cells } = bladeCells(species, phase);
        return cells.reduce((sum, c) => sum + c.y, 0) / cells.length;
      };
      expect(Math.abs(centre(0) - centre(Math.PI))).toBeGreaterThan(1);
    });
  }
});
