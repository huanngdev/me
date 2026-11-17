import { describe, expect, test } from "bun:test";

import { CREATURES } from "../creatures";
import { restSpecimen } from "../specimen";
import { AsciiRenderer } from "../renderer";
import { World } from "../world";

const DT = 1 / 60;

/** A renderer on a fake canvas, with the given colour mode. Records every spray the effects layer is asked for. */
function rendererWith(colors: "natural" | "theme") {
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
    renderer.setColors(colors);
    renderer.resize(1200, 700, 1);
    const sprays: unknown[][] = [];
    const effects = (renderer as unknown as { effects: { spray: (...a: unknown[]) => void } })
      .effects;
    effects.spray = (...a: unknown[]) => {
      sprays.push(a);
    };
    return { renderer, sprays };
  } finally {
    Reflect.set(globalThis, "document", realDocument);
  }
}

describe("world events", () => {
  test("render drains world.events, so a headless World that renders does not grow", () => {
    const { renderer } = rendererWith("natural");
    const world = new World({
      roster: [{ species: "humpback", rel: 1, depth: 1 }],
      baitFish: false,
      seed: 3,
    });
    world.resize(1200, 700, renderer.cellWidth, renderer.cellHeight);
    for (let i = 0; i < 600; i++) world.step(DT);
    renderer.render(world, DT);
    expect(world.events.length).toBe(0);
  });

  test("natural colours spray a blow; theme colours skip it but still clear the event", () => {
    const blow = { kind: "blow" as const, x: 300, y: 300, drops: 14, reach: 28, life: 0.45 };
    const natural = rendererWith("natural");
    const worldN = new World({
      roster: [{ species: "humpback", rel: 1, depth: 1 }],
      baitFish: false,
      seed: 3,
    });
    worldN.resize(1200, 700, natural.renderer.cellWidth, natural.renderer.cellHeight);
    worldN.events.push(blow);
    natural.renderer.render(worldN, DT);
    expect(natural.sprays.length).toBe(1);

    const theme = rendererWith("theme");
    const worldT = new World({
      roster: [{ species: "humpback", rel: 1, depth: 1 }],
      baitFish: false,
      seed: 3,
    });
    worldT.resize(1200, 700, theme.renderer.cellWidth, theme.renderer.cellHeight);
    worldT.events.push(blow);
    theme.renderer.render(worldT, DT);
    expect(theme.sprays.length).toBe(0);
    expect(worldT.events.length).toBe(0);
  });
});

describe("specimen rest pose", () => {
  test("a mammal taken to rest is surfaced: no breath cycle, full colour, no drift", () => {
    // Step into a dive first, so the seeded breath is not already at the surface.
    const world = new World({
      roster: [{ species: "humpback", rel: 1, depth: 1 }],
      baitFish: false,
      seed: 1,
    });
    world.resize(1200, 700, 10, 14.5);
    for (let i = 0; i < 60; i++) world.step(DT);
    const sh = world.creatures[0];
    expect(CREATURES.humpback.taxon).toBe("mammal");
    restSpecimen(sh);
    expect(sh.breath).toBeNull();
    expect(sh.dive).toBe(0);
    expect(sh.depthOffset).toBe(0);
  });

  test("a fish at rest loses its drift offset, so the specimen is at its base depth", () => {
    const world = new World({
      roster: [{ species: "mako", rel: 1, depth: 1 }],
      baitFish: false,
      seed: 1,
    });
    world.resize(1200, 700, 10, 14.5);
    for (let i = 0; i < 300; i++) world.step(DT);
    const sh = world.creatures[0];
    restSpecimen(sh);
    expect(sh.depthOffset).toBe(0);
    expect(sh.dive).toBe(0);
  });
});
