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

function simulate(seed: number) {
  const world = new World({ seed });
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

// Locks the v2 baseline: if this changes, the simulation behaviour changed.
const WORLD_HASH_SEED_42 = 94153949;

// Locks the renderer's draw calls for seed 42 at steps 100, 200 and 300.
const RENDER_HASH_SEED_42 = 66986010;

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
