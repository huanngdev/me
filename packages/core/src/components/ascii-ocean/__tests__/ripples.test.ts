import { describe, expect, test } from "bun:test";

import type { OceanColors } from "../creatures/types";
import { Effects } from "../effects";
import { AsciiRenderer, type OceanPalette } from "../renderer";
import { World } from "../world";

const W = 1200;
const H = 700;
const DT = 1 / 60;

const DARK_PAGE: OceanPalette = {
  background: [10, 10, 10],
  foreground: [230, 238, 255],
  mode: "dark",
};

type Glyph = { text: string; x: number; y: number };

/** A renderer with the surface on (natural colours by default), on a fake canvas that logs every glyph, sized to the world. */
function stage(world: World, colors: OceanColors = "natural") {
  const realDocument = globalThis.document;
  const texts: Glyph[] = [];
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
    fillRect() {},
    fillText(text: string, x: number, y: number) {
      texts.push({ text, x, y });
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
    renderer.setPalette(DARK_PAGE);
    renderer.setColors(colors);
    renderer.setSurface(true);
    renderer.resize(W, H, 1);
    world.resize(W, H, renderer.cellWidth, renderer.cellHeight);
    return { renderer, world, texts };
  } finally {
    Reflect.set(globalThis, "document", realDocument);
  }
}

// R21b: the bite ripple tests went with the eat events (feeding is removed in R21a); they return with R21b.

describe("delayed rings", () => {
  test("a delayed ring is not visited by forEachRing until its delay has passed, then grows from the rest of the step", () => {
    const fx = new Effects();
    fx.ring(100, 100, 50, 30, 1, 0.5);
    const radii: number[] = [];
    const visit = () => {
      radii.length = 0;
      fx.forEachRing((_x, _y, r) => radii.push(r));
      return radii.length;
    };
    fx.step(0.2);
    expect(visit()).toBe(0);
    fx.step(0.2);
    expect(visit()).toBe(0);
    // 0.6 s in: the wait ended at 0.5 s, so 0.1 s of growth at 50 px/s.
    fx.step(0.2);
    expect(visit()).toBe(1);
    expect(radii[0]).toBeCloseTo(5, 3);
  });
});

describe("ring glyphs", () => {
  test("theme colours keep the circle: slashes lower-right lean one way, backslashes lower-left the other", () => {
    // R20: only theme colours and surface-off keep the plain circle; natural water draws the broken ring.
    const world = new World({ seed: 1, baitFish: false, roster: [] });
    const s = stage(world, "theme");
    const fx = Reflect.get(s.renderer, "effects") as Effects;
    const cx = 600;
    const cy = 350;
    // A fast ring, so its radius is about 60 px when drawn.
    fx.ring(cx, cy, 3600, 1000, 1);
    s.renderer.render(world, DT);

    const band = (pick: (t: Glyph) => boolean) =>
      s.texts.filter((t) => {
        const d = Math.hypot(t.x - cx, t.y - cy);
        return d > 45 && d < 75 && pick(t);
      });
    const lowerRight = band((t) => t.x > cx && t.y > cy).map((t) => t.text);
    const lowerLeft = band((t) => t.x < cx && t.y > cy).map((t) => t.text);
    const top = band((t) => Math.abs(t.x - cx) < 8 && t.y < cy).map((t) => t.text);

    expect(lowerRight).toContain("/");
    expect(lowerRight).not.toContain("\\");
    expect(lowerLeft).toContain("\\");
    expect(lowerLeft).not.toContain("/");
    expect(top).toContain("-");
  });
});
