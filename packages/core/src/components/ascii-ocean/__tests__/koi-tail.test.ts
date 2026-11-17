import { describe, expect, test } from "bun:test";

import { angleDiff } from "../math";
import { AsciiRenderer, type OceanPalette } from "../renderer";
import { SPINE_NODES, World } from "../world";

const W = 1200;
const H = 700;
const L = 200;
const CX = W / 2;
const CY = H / 2;
const PHASES = 60;
const BENDS = [0, 0.6, 1.2];

const DARK_PAGE: OceanPalette = {
  background: [10, 10, 10],
  foreground: [230, 238, 255],
  mode: "dark",
};

/** Builds a natural-mode renderer on a fake canvas and a world holding one koi. */
function koiScene() {
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

  // The background canvas is created in the constructor, so the fake document only needs to live that long.
  Reflect.set(globalThis, "document", { createElement: () => fakeCanvas() });
  try {
    const renderer = new AsciiRenderer(fakeCanvas() as unknown as HTMLCanvasElement);
    renderer.setFontFamily("monospace");
    renderer.setPalette(DARK_PAGE);
    renderer.setColors("natural");
    renderer.resize(W, H, 1);
    const world = new World({
      roster: [{ species: "koi", rel: 1, depth: 1 }],
      baitFish: false,
      seed: 1,
    });
    world.resize(W, H, renderer.cellWidth, renderer.cellHeight);
    return { renderer, world };
  } finally {
    Reflect.set(globalThis, "document", realDocument);
  }
}

/** Lays the koi's spine straight from the snout (right) to the tail (left), or on an arc with the given total turn. */
function pose(sh: { nodes: Float32Array | number[] }, turn: number) {
  const seg = L / (SPINE_NODES - 1);
  let x = CX + L / 2;
  let y = CY;
  sh.nodes[0] = x;
  sh.nodes[1] = y;
  for (let k = 1; k < SPINE_NODES; k++) {
    const angle = Math.PI + turn * ((k - 0.5) / (SPINE_NODES - 1) - 0.5);
    x += Math.cos(angle) * seg;
    y += Math.sin(angle) * seg;
    sh.nodes[k * 2] = x;
    sh.nodes[k * 2 + 1] = y;
  }
}

/** Renders one koi at the given tail phase and bend, and returns every half cell it covers. */
function covered(s: ReturnType<typeof koiScene>, phase: number, turn: number) {
  const sh = s.world.creatures[0];
  sh.length = L;
  sh.heading = Math.PI;
  sh.speed = 40;
  sh.turn = 0;
  sh.phase = phase;
  pose(sh, turn);
  const buffers = s.renderer as unknown as { halfFlag: Uint8Array; cols: number };
  // Half flags are not cleared between frames, so clear them before the render.
  buffers.halfFlag.fill(0);
  s.renderer.render(s.world, 1 / 60);
  const cells: { c: number; hr: number }[] = [];
  for (let j = 0; j < buffers.halfFlag.length; j++) {
    if (!buffers.halfFlag[j]) continue;
    const i = j >> 1;
    const h = j & 1;
    cells.push({ c: i % buffers.cols, hr: 2 * Math.floor(i / buffers.cols) + h });
  }
  return cells;
}

/** Every half cell the koi covers, with its flag (1 body, 3 fin). */
function flagged(s: ReturnType<typeof koiScene>, phase: number) {
  covered(s, phase, 0);
  const b = s.renderer as unknown as { halfFlag: Uint8Array; cols: number };
  const cells: { c: number; flag: number }[] = [];
  for (let j = 0; j < b.halfFlag.length; j++) {
    if (b.halfFlag[j]) cells.push({ c: (j >> 1) % b.cols, flag: b.halfFlag[j] });
  }
  return cells;
}

/** Number of 8-connected groups among the given half cells. */
function components(cells: { c: number; hr: number }[]) {
  const left = new Set(cells.map(({ c, hr }) => `${c},${hr}`));
  let count = 0;
  while (left.size > 0) {
    count++;
    const [start] = left;
    left.delete(start);
    const stack = [start];
    while (stack.length > 0) {
      const [c, hr] = stack.pop()!.split(",").map(Number);
      for (let dc = -1; dc <= 1; dc++) {
        for (let dr = -1; dr <= 1; dr++) {
          const key = `${c + dc},${hr + dr}`;
          if (left.delete(key)) stack.push(key);
        }
      }
    }
  }
  return count;
}

/**
 * Width, area and tip position of the tail region (bend 0). Width is the most covered half-rows in one
 * column, in px. The peduncle is the band from s 0.70 to 0.76; the tail is everything past s 0.76.
 */
function tailMeasures(s: ReturnType<typeof koiScene>, phase: number) {
  const cells = covered(s, phase, 0);
  const cw = (s.renderer as unknown as { cw: number }).cw;
  const ch = (s.renderer as unknown as { ch: number }).ch;
  const snoutX = CX + L / 2;
  // Covered half rows per column, for the peduncle band and for the tail.
  const peduncleColumns = new Map<number, number>();
  const tailColumns = new Map<number, number>();
  for (const { c } of cells) {
    const sPos = (snoutX - (c * cw + cw / 2)) / L;
    const columns = sPos > 0.76 ? tailColumns : sPos > 0.7 ? peduncleColumns : null;
    if (columns) columns.set(c, (columns.get(c) ?? 0) + 1);
  }
  const peduncle = Math.max(0, ...peduncleColumns.values());
  const tailCounts = [...tailColumns.values()];
  // Mean half row of the tail's last cells (s past 0.9), which is where a sway shows most.
  const tipRows = cells
    .filter(({ c }) => (snoutX - (c * cw + cw / 2)) / L > 0.9)
    .map(({ hr }) => hr);
  const tipRow = tipRows.reduce((sum, hr) => sum + hr, 0) / (tipRows.length || 1);
  const tailWidth = Math.max(0, ...tailCounts);
  const tailArea = tailCounts.reduce((sum, n) => sum + n, 0);
  return { peduncle: (peduncle * ch) / 2, tailWidth: (tailWidth * ch) / 2, tailArea, tipRow };
}

describe("koi tail", () => {
  test("a koi is one connected shape at every tail phase and bend", () => {
    const s = koiScene();
    const failures: string[] = [];
    for (const turn of BENDS) {
      for (let p = 0; p < PHASES; p++) {
        const phase = (p / PHASES) * Math.PI * 2;
        const count = components(covered(s, phase, turn));
        if (count !== 1) failures.push(`phase ${phase.toFixed(2)} bend ${turn}: ${count} parts`);
      }
    }
    expect(failures).toEqual([]);
  });

  test("the tail is no wider than about 1.6 times the peduncle at any phase", () => {
    const s = koiScene();
    // The body wave tilts the peduncle against the cell grid, so its width is taken at rest.
    const { peduncle } = tailMeasures(s, 0);
    for (let p = 0; p < 8; p++) {
      const m = tailMeasures(s, (p / 8) * Math.PI * 2);
      expect(m.tailWidth).toBeLessThanOrEqual(1.6 * peduncle);
    }
  });

  test("no body cell pokes out behind the blade's root at any phase", () => {
    const s = koiScene();
    const cw = (s.renderer as unknown as { cw: number }).cw;
    const snoutX = CX + L / 2;
    const stray: string[] = [];
    for (let p = 0; p < PHASES; p++) {
      const phase = (p / PHASES) * Math.PI * 2;
      for (const { c, flag } of flagged(s, phase)) {
        // The blade takes over at s 0.76 (0.03 past its root); a whole cell of margin for the cell grid.
        const sPos = (snoutX - (c * cw + cw / 2)) / L;
        if (sPos > 0.76 + cw / L && flag !== 3)
          stray.push(`phase ${phase.toFixed(2)} col ${c} flag ${flag}`);
      }
    }
    expect(stray).toEqual([]);
  });

  test("the blade sways sideways at the beat's two extremes instead of swelling", () => {
    const s = koiScene();
    const left = tailMeasures(s, Math.PI / 2);
    const right = tailMeasures(s, (3 * Math.PI) / 2);
    // The tip's centre moves across the axis by at least two half rows between the extremes.
    expect(Math.abs(left.tipRow - right.tipRow)).toBeGreaterThanOrEqual(2);
    // Its size stays put: neither extreme has much more blade than the other.
    expect(Math.abs(left.tailArea - right.tailArea)).toBeLessThanOrEqual(0.2 * right.tailArea);
  });
});

/** Total turn of a spine: the sum of the absolute bend at each joint, in radians. */
function spineTurn(nodes: Float32Array) {
  let total = 0;
  let prev = Math.atan2(nodes[3] - nodes[1], nodes[2] - nodes[0]);
  for (let k = 2; k < SPINE_NODES; k++) {
    const angle = Math.atan2(
      nodes[k * 2 + 1] - nodes[(k - 1) * 2 + 1],
      nodes[k * 2] - nodes[(k - 1) * 2],
    );
    total += Math.abs(angleDiff(prev, angle));
    prev = angle;
  }
  return total;
}

/** Steps a pond of seven koi for 60 s and returns every creature's spine turn at every step, sorted. */
function koiPondTurns() {
  const world = new World({
    roster: Array.from({ length: 7 }, () => ({ species: "koi" as const, rel: 1, depth: 1 })),
    scene: "pond",
    seed: 3,
  });
  world.resize(W, H, 10, 15);
  const turns: number[] = [];
  for (let i = 0; i < 60 * 60; i++) {
    world.step(1 / 60);
    for (const sh of world.creatures) turns.push(spineTurn(sh.nodes));
  }
  return turns.sort((a, b) => a - b);
}

describe("koi spine turn", () => {
  // Koi still curve into a C when they turn, but never past 18 joints × 0.09 rad (a shark's 0.16 folds it into an S).
  test("seven koi in a pond never bend past the koi joint limit", () => {
    const turns = koiPondTurns();
    expect(turns[turns.length - 1]).toBeLessThanOrEqual(18 * 0.09 + 1e-4);
  });
});
