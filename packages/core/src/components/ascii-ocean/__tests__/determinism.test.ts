import { describe, expect, test } from "bun:test";

import { AsciiRenderer } from "../renderer";
import { World } from "../world";

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/** Folds a string into a running FNV-1a 32-bit hash. */
function fnv(hash: number, text: string) {
  let h = hash;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, FNV_PRIME);
  }
  return h >>> 0;
}

const round3 = (v: number) => Math.round(v * 1000);
const round2 = (v: number) => Math.round(v * 100) / 100;

function simulate(seed: number, scene: "ocean" | "pond" = "ocean") {
  const world = new World({ seed, scene });
  world.resize(1200, 700, 10, 14.5);
  for (let i = 0; i < 600; i++) world.step(1 / 60);

  let hash = FNV_OFFSET;
  for (const f of world.fish) {
    hash = fnv(
      hash,
      `${round3(f.x)},${round3(f.y)},${round3(f.vx)},${round3(f.vy)},${f.alive},${f.species};`,
    );
  }
  for (const sh of world.creatures) {
    hash = fnv(hash, `${round3(sh.heading)},${round3(sh.speed)};`);
    for (let n = 0; n < sh.nodes.length; n += 2) {
      hash = fnv(hash, `${round3(sh.nodes[n])},${round3(sh.nodes[n + 1])};`);
    }
  }
  return hash;
}

// R21a: animals only swim (no hunting, feeding or shows). Locks the simulation for seed 42.
// R21d: proportional turning, wider turning circle, smoothed steering, one separation push per neighbour, stronger pod alignment.
// V3 R10: breath and drift seeds drawn after the fish, so the rng stream for every later step changed.
const WORLD_HASH_SEED_42 = 1644542565;

// R21a: animals only swim (no hunting, feeding or shows). Locks the renderer's draw calls for seed 42 at steps 100, 200 and 300.
// R21d: proportional turning, wider turning circle, smoothed steering, one separation push per neighbour, stronger pod alignment.
// V3 R8: heterocercal shark tails and the fluke notch (no body between the flukes), so the draw calls changed.
// V3 R10: rng stream, and sharks drift in depth, which moves their theme shadows.
// V3 R13: theme mode reads the base depth only (no drift, no dive; it keeps the classic cover), and the
// classic shark pectorals are widened. Seed 42 is four classic sharks, so both changes show here; the sim hash is unchanged.
const RENDER_HASH_SEED_42 = 2603119813;

// V3 R13: a pond world draws no breath or drift rng (the ocean-only guard runs first), so its stream is the pre-R10 one.
const POND_HASH_SEED_42 = 1887595833;

describe("ascii-ocean determinism", () => {
  test("the same seed gives the same world", () => {
    expect(simulate(7)).toBe(simulate(7));
  });

  test("different seeds give different worlds", () => {
    expect(simulate(1)).not.toBe(simulate(2));
  });

  test("seed 42 matches the locked baseline", () => {
    expect(simulate(42)).toBe(WORLD_HASH_SEED_42);
  });

  test("seed 42 pond matches the locked baseline (the pond draws no breath or drift rng)", () => {
    expect(simulate(42, "pond")).toBe(POND_HASH_SEED_42);
  });

  test("seed 42 renders the locked draw calls", () => {
    const realDocument = globalThis.document;
    let hash = FNV_OFFSET;
    let fillStyle = "";

    const ctx = {
      font: "",
      textAlign: "",
      textBaseline: "",
      strokeStyle: "",
      lineWidth: 0,
      get fillStyle() {
        return fillStyle;
      },
      set fillStyle(value: string) {
        fillStyle = value;
      },
      fillRect(x: number, y: number, w: number, h: number) {
        hash = fnv(hash, `rect ${round2(x)},${round2(y)},${round2(w)},${round2(h)} ${fillStyle};`);
      },
      fillText(text: string, x: number, y: number) {
        hash = fnv(hash, `text ${text},${round2(x)},${round2(y)} ${fillStyle};`);
      },
      drawImage(_image: unknown, x: number, y: number) {
        hash = fnv(hash, `image ${round2(x)},${round2(y)};`);
      },
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
    const fakeCanvas = () => ({
      width: 0,
      height: 0,
      getContext: () => ctx,
    });

    // The test preload defines document, so always swap in the fake: the background canvas needs it too.
    Reflect.set(globalThis, "document", { createElement: () => fakeCanvas() });
    try {
      const canvas = fakeCanvas() as unknown as HTMLCanvasElement;
      const renderer = new AsciiRenderer(canvas);
      renderer.setFontFamily("monospace");
      renderer.resize(1200, 700, 1);

      const world = new World({ seed: 42 });
      world.resize(1200, 700, renderer.cellWidth, renderer.cellHeight);
      for (let step = 1; step <= 300; step++) {
        world.step(1 / 60);
        if (step % 100 === 0) renderer.render(world, 1 / 60);
      }
    } finally {
      Reflect.set(globalThis, "document", realDocument);
    }

    expect(hash).toBe(RENDER_HASH_SEED_42);
  });
});
