import { describe, expect, test } from "bun:test";

import { attenuate } from "../renderer";
import { habitatOf, OCEAN, POND } from "../habitats";

describe("habitats", () => {
  test("each scene lives in its habitat", () => {
    expect(habitatOf("ocean")).toBe(OCEAN);
    expect(habitatOf("pond")).toBe(POND);
    expect(OCEAN.id).toBe("ocean");
    expect(POND.id).toBe("pond");
  });

  test("absorption: red goes first; ocean blue lasts longest, pond green lasts longest", () => {
    const [oR, oG, oB] = OCEAN.absorb;
    expect(oR).toBeGreaterThan(oG);
    expect(oG).toBeGreaterThan(oB);
    const [pR, pG, pB] = POND.absorb;
    expect(pR).toBeGreaterThan(pB);
    expect(pB).toBeGreaterThan(pG);
  });

  test("deep water is darker than the surface, on both page modes", () => {
    for (const habitat of [OCEAN, POND]) {
      for (const mode of ["dark", "light"] as const) {
        const { surface, deep } = habitat.water[mode];
        const lum = (c: readonly number[]) => c[0] + c[1] + c[2];
        expect(lum(deep)).toBeLessThan(lum(surface));
      }
    }
  });

  for (const habitat of [OCEAN, POND]) {
    test(`${habitat.id}: light fades with depth, and red falls fastest`, () => {
      // Absorb toward black, so each channel's transmitted fraction shows directly.
      const white: [number, number, number] = [200, 200, 200];
      const black: [number, number, number] = [0, 0, 0];
      let prev = 0;
      for (const depth of [0, 0.25, 0.5, 0.75, 1]) {
        const [r, g, b] = attenuate(white, black, depth, habitat.id);
        // Brighter nearer the surface: the total light rises with depth.
        expect(r + g + b).toBeGreaterThanOrEqual(prev);
        prev = r + g + b;
      }
      const [r0, g0, b0] = attenuate(white, black, 0, habitat.id);
      // The channel with the largest k loses the most: its transmitted share is the smallest.
      const share = (v: number) => v / 200;
      const order = [share(r0), share(g0), share(b0)];
      const ks = habitat.absorb;
      const fastest = ks.indexOf(Math.max(...ks));
      expect(order[fastest]).toBe(Math.min(...order));
    });
  }

  test("the haze pulls far animals toward the target colour, not toward black", () => {
    const target: [number, number, number] = [28, 58, 42];
    const deepAnimal = attenuate([200, 200, 200], target, 0, "pond");
    const blackAnimal = attenuate([200, 200, 200], [0, 0, 0], 0, "pond");
    expect(deepAnimal[1]).toBeGreaterThan(blackAnimal[1]);
  });
});
