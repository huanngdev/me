import { describe, expect, test } from "bun:test";

import { World } from "../world";

/**
 * The engine steps the world in n equal substeps per frame (dt / n each). A 120 Hz run and a 60 Hz run
 * of the same seed must tell the same story: the same average speed and fish count, and no NaN.
 */
function run(stepDt: number, seconds: number) {
  const world = new World({ seed: 42 });
  world.resize(1200, 700, 10, 14.5);
  // Sample once per 1/60 s, so both runs weigh time equally.
  const every = Math.round(1 / 60 / stepDt);
  const total = Math.round(seconds / stepDt);
  let speedSum = 0;
  let speedCount = 0;
  let fishSum = 0;
  let samples = 0;
  let finite = true;
  for (let i = 1; i <= total; i++) {
    world.step(stepDt);
    if (i % every !== 0) continue;
    samples++;
    for (const sh of world.creatures) {
      speedSum += sh.speed;
      speedCount++;
      if (!Number.isFinite(sh.speed)) finite = false;
    }
    for (const f of world.fish) {
      if (f.alive) fishSum++;
      if (!Number.isFinite(f.x) || !Number.isFinite(f.y)) finite = false;
    }
  }
  return {
    meanSpeed: speedCount ? speedSum / speedCount : 0,
    meanFish: fishSum / samples,
    finite,
  };
}

describe("engine substeps: refresh rate does not change the simulation", () => {
  const at60 = run(1 / 60, 10);
  const at120 = run(1 / 120, 10);

  test("no NaN or infinite state at 60 Hz or 120 Hz", () => {
    expect(at60.finite).toBe(true);
    expect(at120.finite).toBe(true);
    expect(Number.isNaN(at60.meanSpeed)).toBe(false);
    expect(Number.isNaN(at120.meanSpeed)).toBe(false);
  });

  test("mean creature speed matches within 5%", () => {
    expect(at60.meanSpeed).toBeGreaterThan(0);
    const ratio = at120.meanSpeed / at60.meanSpeed;
    expect(Math.abs(ratio - 1)).toBeLessThan(0.05);
  });

  test("mean fish count matches within 5%", () => {
    expect(at60.meanFish).toBeGreaterThan(0);
    const ratio = at120.meanFish / at60.meanFish;
    expect(Math.abs(ratio - 1)).toBeLessThan(0.05);
  });
});
