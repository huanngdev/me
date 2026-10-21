import { describe, expect, test } from "bun:test";

import { drawOrder } from "../renderer";
import { World } from "../world";

const W = 1200;
const H = 700;
const CW = 10;
const CH = 14.5;

describe("draw order", () => {
  test("animals are drawn in ascending depth order", () => {
    const world = new World({
      roster: [
        { species: "classic", rel: 0.7, depth: 0.7 },
        { species: "classic", rel: 0.84, depth: 0.84 },
        { species: "classic", rel: 1, depth: 1 },
      ],
      baitFish: false,
      seed: 1,
    });
    world.resize(W, H, CW, CH);
    const out = new Int16Array(world.creatures.length);
    drawOrder(world.creatures, out);
    expect([...out]).toEqual([0, 1, 2]);
  });
});
