import { describe, expect, test } from "bun:test";

import { squarify, toPercentages, type TreemapRect } from "./tile-treemap.utils";

const area = (rect: TreemapRect | undefined) => (rect ? rect.width * rect.height : 0);

const overlaps = (a: TreemapRect, b: TreemapRect) => {
  const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return width > 0.001 && height > 0.001;
};

describe("toPercentages", () => {
  test("computes each share of the total", () => {
    expect(toPercentages([1, 1, 2])).toEqual([25, 25, 50]);
  });

  test("treats negative values as zero", () => {
    expect(toPercentages([3, -1])).toEqual([100, 0]);
  });

  test("returns zeros when the total is zero", () => {
    expect(toPercentages([0, 0])).toEqual([0, 0]);
  });
});

describe("squarify", () => {
  test("returns one zeroed rect per value when there is nothing to lay out", () => {
    const rects = squarify([0, 0], 100, 100);
    expect(rects).toHaveLength(2);
    expect(rects.every((rect) => area(rect) === 0)).toBe(true);
  });

  test("fills the full frame for non-zero values", () => {
    const rects = squarify([6, 6, 4, 3, 2, 2, 1], 600, 400);
    const total = rects.reduce((sum, rect) => sum + area(rect), 0);
    expect(total).toBeCloseTo(600 * 400, 4);
  });

  test("keeps every tile inside the frame without overlapping", () => {
    const rects = squarify([10, 8, 6, 4, 3, 2, 1], 480, 320);

    for (const rect of rects) {
      expect(rect.x).toBeGreaterThanOrEqual(-0.001);
      expect(rect.y).toBeGreaterThanOrEqual(-0.001);
      expect(rect.x + rect.width).toBeLessThanOrEqual(480.001);
      expect(rect.y + rect.height).toBeLessThanOrEqual(320.001);
    }

    for (let i = 0; i < rects.length; i += 1) {
      for (let j = i + 1; j < rects.length; j += 1) {
        const a = rects[i];
        const b = rects[j];
        if (a && b) expect(overlaps(a, b)).toBe(false);
      }
    }
  });

  test("gives a larger value a larger area", () => {
    const rects = squarify([5, 2, 1], 300, 200);
    expect(area(rects[0])).toBeGreaterThan(area(rects[1]));
    expect(area(rects[1])).toBeGreaterThan(area(rects[2]));
  });

  test("keeps tile aspect ratios close to square for mixed values", () => {
    const rects = squarify([8, 5, 3, 2, 1, 1], 640, 360);

    for (const rect of rects) {
      if (rect.width === 0 || rect.height === 0) continue;
      const ratio = Math.max(rect.width / rect.height, rect.height / rect.width);
      expect(ratio).toBeLessThan(4);
    }
  });

  test("maps results back to the original order", () => {
    const rects = squarify([1, 4, 2], 300, 200);
    expect(area(rects[1])).toBeGreaterThan(area(rects[2]));
    expect(area(rects[2])).toBeGreaterThan(area(rects[0]));
  });
});
