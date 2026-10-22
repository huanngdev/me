import { describe, expect, mock, test } from "bun:test";

import { CREATURES } from "../creatures";
import type { CreatureDef } from "../creatures/types";
import { blobs, valueNoise } from "../creatures/paint";
import type { RosterEntry } from "../creatures/roster";
import type { Coat, PaintPoint } from "../creatures/types";
import * as math from "../math";
import { createRng } from "../math";
import type { AsciiRenderer as RendererClass } from "../renderer";
import { World } from "../world";

const FLAG_BODY = 1;
const FLAG_FIN = 3;
const L = 100;
const W = 1200;
const H = 700;
const ID = 7;
const koi = CREATURES.koi;

type Cell = { s: number; v: number; across: number; flag: number; region: number } | null;

/**
 * A dense grid over one creature (koi by default): rows are s (snout to tail), columns are v in px. Body
 * points are on the outline; points just outside it in the fin band are fins. Everything else is null.
 */
function paintGrid(
  coat: Coat,
  id: number,
  def: CreatureDef = koi,
  finBand: [number, number] = [0.16, 0.3],
): Cell[][] {
  const paint = coat.paint ?? (() => 0);
  const p: PaintPoint = { s: 0, v: 0, L, across: 0, flag: 0, id };
  const rows: Cell[][] = [];
  for (let k = 0; k <= 400; k++) {
    const s = k / 400;
    const w = def.shape.halfWidth(s) * L;
    const row: Cell[] = [];
    for (let v = -0.2 * L; v <= 0.2 * L + 1e-9; v += 0.25) {
      const onBody = Math.abs(v) <= w;
      const onFin = !onBody && s >= finBand[0] && s <= finBand[1];
      if (!onBody && !onFin) {
        row.push(null);
        continue;
      }
      p.s = s;
      p.v = v;
      p.across = onBody ? Math.abs(v) / w : Math.abs(v) / (0.2 * L);
      p.flag = onBody ? FLAG_BODY : FLAG_FIN;
      row.push({ s, v, across: p.across, flag: p.flag, region: paint(p) });
    }
    rows.push(row);
  }
  return rows;
}

const allCells = (grid: Cell[][]) => grid.flat().filter((c): c is NonNullable<Cell> => c !== null);
const bodyCells = (grid: Cell[][]) => allCells(grid).filter((c) => c.flag === FLAG_BODY);

function regionCounts(cells: { region: number }[]) {
  const counts = new Map<number, number>();
  for (const c of cells) counts.set(c.region, (counts.get(c.region) ?? 0) + 1);
  return counts;
}

/** Number of 4-connected groups of cells that satisfy `pred`. */
function components(grid: Cell[][], pred: (c: NonNullable<Cell>) => boolean) {
  const seen = grid.map((row) => row.map(() => false));
  let count = 0;
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[r].length; c++) {
      const cell = grid[r][c];
      if (!cell || seen[r][c] || !pred(cell)) continue;
      count++;
      const stack = [[r, c]];
      seen[r][c] = true;
      while (stack.length) {
        const [y, x] = stack.pop() as [number, number];
        for (const [dy, dx] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const ny = y + dy;
          const nx = x + dx;
          if (ny < 0 || ny >= grid.length || nx < 0 || nx >= grid[ny].length) continue;
          const next = grid[ny][nx];
          if (!next || seen[ny][nx] || !pred(next)) continue;
          seen[ny][nx] = true;
          stack.push([ny, nx]);
        }
      }
    }
  }
  return count;
}

const coats = koi.coats as Record<string, Coat>;
// Captured before any mock, so the counting wrapper below calls the real conversion.
const realOklchToRgb = math.oklchToRgb;

describe("valueNoise and blobs", () => {
  test("deterministic and in [0, 1)", () => {
    const rng = createRng(3);
    for (let i = 0; i < 1000; i++) {
      const x = (rng() - 0.5) * 40;
      const y = (rng() - 0.5) * 40;
      const f = valueNoise(x, y, 11);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
      expect(valueNoise(x, y, 11)).toBe(f);
    }
  });

  test("continuous: a 1e-3 step moves the value by under 0.01", () => {
    const rng = createRng(5);
    for (let i = 0; i < 1000; i++) {
      const x = (rng() - 0.5) * 40;
      const y = (rng() - 0.5) * 40;
      expect(Math.abs(valueNoise(x, y, 2) - valueNoise(x + 1e-3, y, 2))).toBeLessThan(0.01);
    }
  });

  test("blobs is valueNoise at s/scale and v/L/scale with id and salt folded into the seed", () => {
    expect(blobs(0.3, 0.1, 4, 0.09, 1)).toBe(valueNoise(0.3 / 0.09, 0.1 / 0.09, 4 * 131 + 1));
  });
});

describe("koi coats", () => {
  test("tancho: red only inside the head disc, and one connected red area", () => {
    const grid = paintGrid(coats.tancho, ID);
    const red = allCells(grid).filter((c) => c.region === 1);
    expect(red.length).toBeGreaterThan(0);
    for (const c of red) {
      const dx = (c.s - 0.075) * L;
      expect(dx * dx + c.v * c.v).toBeLessThan((0.045 * L) ** 2 + 1e-6);
    }
    expect(components(grid, (c) => c.region === 1)).toBe(1);
  });

  test("kohaku: red patches, a white base, and no black", () => {
    const counts = regionCounts(bodyCells(paintGrid(coats.kohaku, ID)));
    expect(counts.get(1) ?? 0).toBeGreaterThan(0);
    expect(counts.get(0) ?? 0).toBeGreaterThan(counts.get(1) ?? 0);
    expect([...counts.keys()].every((r) => r === 0 || r === 1)).toBe(true);
  });

  test("sanke: has black spots, and none where s < 0.15", () => {
    const cells = bodyCells(paintGrid(coats.sanke, ID));
    expect(cells.some((c) => c.region === 2)).toBe(true);
    expect(cells.filter((c) => c.s < 0.15 && c.region === 2)).toEqual([]);
  });

  test("showa: black is the most common region", () => {
    const counts = regionCounts(bodyCells(paintGrid(coats.showa, ID)));
    const black = counts.get(0) ?? 0;
    expect(black).toBeGreaterThan(counts.get(1) ?? 0);
    expect(black).toBeGreaterThan(counts.get(2) ?? 0);
  });

  test("ogon: exactly one region index", () => {
    const used = new Set(allCells(paintGrid(coats.ogon, ID)).map((c) => c.region));
    expect([...used]).toEqual([0]);
    expect(coats.ogon.glint).toBe(true);
  });

  test("asagi: net and base both appear; red only on the flanks or on fins", () => {
    const cells = allCells(paintGrid(coats.asagi, ID));
    const used = new Set(cells.map((c) => c.region));
    expect(used.has(0)).toBe(true);
    expect(used.has(1)).toBe(true);
    for (const c of cells) {
      if (c.region === 2) expect(c.across > 0.62 || c.flag === FLAG_FIN).toBe(true);
    }
  });

  test("the same id gives the same pattern; different ids give different kohaku patterns", () => {
    const signature = (id: number) =>
      paintGrid(coats.kohaku, id)
        .flat()
        .map((c) => (c ? c.region : "-"))
        .join("");
    expect(signature(ID)).toBe(signature(ID));
    expect(signature(1)).not.toBe(signature(2));
  });
});

describe("natural koi render", () => {
  /** Natural-mode render of one animal on a fake canvas, recording fills. */
  function render(
    roster: RosterEntry[],
    steps: number,
    reuse?: InstanceType<typeof RendererClass>,
  ) {
    const realDocument = globalThis.document;
    const rects: { w: number; style: string }[] = [];
    let fillStyle = "";
    const ctx = {
      font: "",
      textAlign: "",
      textBaseline: "",
      get fillStyle() {
        return fillStyle;
      },
      set fillStyle(value: string) {
        fillStyle = value;
      },
      fillRect(_x: number, _y: number, w: number) {
        rects.push({ w, style: fillStyle });
      },
      fillText() {},
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
      // Imported lazily so the spy below wraps the renderer's own import.
      const renderer = reuse ?? new AsciiRendererCtor(fakeCanvas() as unknown as HTMLCanvasElement);
      if (!reuse) {
        renderer.setFontFamily("monospace");
        renderer.setColors("natural");
        renderer.resize(W, H, 1);
      }
      const world = new World({ seed: 42, roster });
      world.resize(W, H, renderer.cellWidth, renderer.cellHeight);
      for (let k = 0; k < steps; k++) world.step(1 / 60);
      rects.length = 0;
      renderer.render(world, 1 / 60);
      return { rects, cw: renderer.cellWidth, renderer };
    } finally {
      Reflect.set(globalThis, "document", realDocument);
    }
  }
  let AsciiRendererCtor = null as unknown as typeof RendererClass;

  test("a kohaku renders red body fills", async () => {
    AsciiRendererCtor = (await import("../renderer")).AsciiRenderer;
    const { rects, cw } = render([{ species: "koi", rel: 1, depth: 1, coat: "kohaku" }], 100);
    const parse = (style: string) => style.slice(4, -1).split(",").map(Number);
    const bodies = rects.filter((r) => r.w === cw - 1 && r.style.startsWith("rgb("));
    expect(
      bodies.some((r) => {
        const [red, , blue] = parse(r.style);
        return red - blue > 60;
      }),
    ).toBe(true);
  });

  test("the ramp cache: a second render makes no oklchToRgb calls", async () => {
    // A fresh coat object has no ramps yet, so the first render builds them and the second reads them.
    const fresh: Coat = { regions: coats.kohaku.regions, paint: coats.kohaku.paint };
    const named = koi.coats as Record<string, Coat>;
    const saved = named.kohaku;
    named.kohaku = fresh;
    let calls = 0;
    // A pass-through wrapper that counts calls. The mock stays installed; it only counts.
    mock.module("../math", () => ({
      ...math,
      oklchToRgb: (...args: Parameters<typeof realOklchToRgb>) => {
        calls++;
        return realOklchToRgb(...args);
      },
    }));
    try {
      AsciiRendererCtor = (await import("../renderer")).AsciiRenderer;
      const roster: RosterEntry[] = [{ species: "koi", rel: 1, depth: 1, coat: "kohaku" }];
      const { renderer } = render(roster, 50);
      const first = calls;
      calls = 0;
      render(roster, 50, renderer);
      expect(first).toBeGreaterThan(0);
      expect(calls).toBe(0);
    } finally {
      named.kohaku = saved;
    }
  });
});

describe("orca coat", () => {
  const orca = CREATURES.orca;
  const grid = paintGrid(orca.coats?.orca as Coat, ID, orca);
  const cells = allCells(grid);

  test("white appears only within the eye-patch zone (s 0.11–0.25)", () => {
    const white = cells.filter((c) => c.region === 1);
    expect(white.length).toBeGreaterThan(0);
    for (const c of white) {
      expect(c.s).toBeGreaterThanOrEqual(0.11);
      expect(c.s).toBeLessThanOrEqual(0.25);
    }
  });

  test("grey appears only within the saddle zone (s 0.45–0.6)", () => {
    const grey = cells.filter((c) => c.region === 2);
    expect(grey.length).toBeGreaterThan(0);
    for (const c of grey) {
      expect(c.s).toBeGreaterThanOrEqual(0.45);
      expect(c.s).toBeLessThanOrEqual(0.6);
    }
  });

  test("black is more than 60% of painted points", () => {
    const counts = regionCounts(cells);
    expect((counts.get(0) ?? 0) / cells.length).toBeGreaterThan(0.6);
  });
});

describe("humpback coat", () => {
  const humpback = CREATURES.humpback;
  const grid = paintGrid(humpback.coats?.humpback as Coat, ID, humpback, [0.22, 0.52]);
  const cells = allCells(grid);

  test("more than 60% of fin points are white", () => {
    const fins = cells.filter((c) => c.flag === FLAG_FIN);
    expect(fins.length).toBeGreaterThan(0);
    const white = fins.filter((c) => c.region === 1);
    expect(white.length / fins.length).toBeGreaterThan(0.6);
  });

  test("tubercle knobs are on the head only: some with s < 0.2, none with s > 0.22", () => {
    const knobs = cells.filter((c) => c.region === 2);
    expect(knobs.some((c) => c.s < 0.2)).toBe(true);
    expect(knobs.filter((c) => c.s > 0.22)).toEqual([]);
  });
});

describe("bottlenose coat", () => {
  const bottlenose = CREATURES.bottlenose;
  const grid = paintGrid(bottlenose.coats?.bottlenose as Coat, ID, bottlenose);
  const cells = allCells(grid);

  test("the cape covers the midline for s in [0.1, 0.8]", () => {
    const midline = cells.filter((c) => c.across < 0.1 && c.s >= 0.1 && c.s <= 0.8);
    expect(midline.length).toBeGreaterThan(0);
    expect(midline.every((c) => c.region === 0)).toBe(true);
  });

  test("flanks exist", () => {
    expect(cells.some((c) => c.region === 1)).toBe(true);
  });
});
