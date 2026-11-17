import { CREATURES } from "@/components/ascii-ocean/creatures";
import { rosterFromGroups } from "@/components/ascii-ocean/creatures/roster";
import type {
  CreatureGroup,
  CreatureSpecies,
  OceanColors,
  OceanScene,
} from "@/components/ascii-ocean/creatures/types";
import { createRng } from "@/components/ascii-ocean/math";
import { createPaletteReader } from "@/components/ascii-ocean/palette";
import { AsciiRenderer } from "@/components/ascii-ocean/renderer";
import { SPINE_NODES, World } from "@/components/ascii-ocean/world";
import { SPECIES_NAMES } from "@/content/component-docs/ascii-ocean";

// ── Frame, stage and brand ──────────────────────────────────────────────────

export const FPS = 60;
export const TOTAL = 60 * FPS;
/** The soundtrack runs at 150 BPM: one beat is 24 frames, and every cut lands on one. */
const BEAT = 24;
const W = 1920;
const H = 1080;
/** Oceans are laid out at 1280×720 and scaled up 1.5×, so the cells read on a phone. */
const LW = 1280;
const LH = 720;
const S = 1.5;
const DT = 1 / FPS;

const BG = "#0c0a11";
const FG = "#f2f0f7";
const MUTED = "rgba(242,240,247,0.58)";
const FAINT = "rgba(242,240,247,0.14)";
const ACCENT = "#a58bff";
const LIGHT_BG = "#f7f6fa";
const LIGHT_FG = "#1c1924";
const SANS = "var(--font-sans), Inter, sans-serif";
const MONO = "var(--font-mono), 'JetBrains Mono', monospace";

/** Scene boundaries; each one is hidden under a glyph wipe. */
const CUTS = [192, 576, 960, 1728, 2208, 2592, 2976, 3264];
const WIPE_HALF = 16;
const OUTRO = TOTAL - 60;

// ── Easing and helpers ──────────────────────────────────────────────────────

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const prog = (f: number, a: number, b: number) => clamp01((f - a) / (b - a));
const outExpo = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
const inCubic = (t: number) => t * t * t;
const outCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const inOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const inOutSine = (t: number) => -(Math.cos(Math.PI * t) - 1) / 2;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function hash(a: number, b: number, c = 0) {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

const SCRAMBLE = "#%&*+=-:/\\|<>[]{}~^";
/** Decodes `text` left to right: settled characters, then a short tail of noise glyphs. */
function scramble(text: string, p: number, f: number, salt = 0, tail = 6) {
  const shown = p * (text.length + tail);
  let out = "";
  for (let i = 0; i < text.length; i++) {
    if (i < shown - tail) out += text[i];
    else if (i < shown)
      out += text[i] === " " ? " " : SCRAMBLE[hash(i, f >> 1, salt) % SCRAMBLE.length];
    else break;
  }
  return out;
}

function div(parent: HTMLElement, css: string, text?: string) {
  const el = document.createElement("div");
  el.style.cssText = css;
  if (text !== undefined) el.textContent = text;
  parent.appendChild(el);
  return el;
}

/** One clipped span per letter, so each can rise out of its own mask. */
function letters(parent: HTMLElement, text: string, css: string) {
  const line = div(parent, `white-space:nowrap;${css}`);
  const spans: HTMLSpanElement[] = [];
  for (const ch of text) {
    const mask = document.createElement("span");
    mask.style.cssText =
      "display:inline-block;overflow:hidden;vertical-align:top;padding:0.04em 0 0.14em;margin:-0.04em 0 -0.14em";
    const inner = document.createElement("span");
    inner.style.cssText = "display:inline-block;will-change:transform";
    inner.textContent = ch === " " ? " " : ch;
    mask.appendChild(inner);
    line.appendChild(mask);
    spans.push(inner);
  }
  return { line, spans };
}

type Out = { at: number; stagger?: number; dur?: number };
/** Letters rise in with a stagger and, with `out`, rise away again. */
function rise(spans: HTMLElement[], l: number, at: number, stagger = 2, dur = 42, out?: Out) {
  spans.forEach((s, i) => {
    let y = (1 - outExpo(prog(l, at + i * stagger, at + i * stagger + dur))) * 110;
    if (out) {
      const os = out.stagger ?? 1;
      const o = inCubic(prog(l, out.at + i * os, out.at + i * os + (out.dur ?? 22)));
      y -= o * 110;
    }
    s.style.transform = `translate3d(0,${y.toFixed(2)}%,0)`;
  });
}

/** Fade and lift in over [a, a+d]; fade and lift away from `outAt`. */
function fade(el: HTMLElement, l: number, a: number, d = 30, outAt = Infinity, dy = 14) {
  const pin = outExpo(prog(l, a, a + d));
  const pout = inCubic(prog(l, outAt, outAt + 20));
  el.style.opacity = (pin * (1 - pout)).toFixed(3);
  el.style.transform = `translate3d(0,${((1 - pin) * dy - pout * dy).toFixed(2)}px,0)`;
}

// ── Ocean and specimen factories ────────────────────────────────────────────

const readPalette = createPaletteReader();

type OceanSpec = {
  creatures: CreatureGroup[];
  seed: number;
  scene?: OceanScene;
  colors?: OceanColors;
  surface?: boolean;
  baitFish?: number | "auto" | false;
  /** Canvas pixel ratio; the macro zoom needs more than the 1.5× scale-up. */
  dpr?: number;
  light?: boolean;
  /** Seconds simulated before the first frame, so the animals have spread out. */
  preroll?: number;
  /** CSS filter on the canvas: a colour grade, like any footage gets. */
  grade?: string;
};

const GRADE = "brightness(1.32) saturate(1.2)";
const SURFACE_GRADE = "brightness(1.75) contrast(1.08) saturate(1.25)";

type Ocean = { wrap: HTMLDivElement; world: World; tick(render: boolean): void };

function makeOcean(parent: HTMLElement, spec: OceanSpec): Ocean {
  const wrap = div(
    parent,
    `position:absolute;left:0;top:0;width:${LW}px;height:${LH}px;transform-origin:0 0;transform:scale(${S});filter:${spec.grade ?? GRADE}`,
  );
  const canvas = document.createElement("canvas");
  canvas.style.cssText = `display:block;width:100%;height:100%;font-family:${MONO};background:${
    spec.light ? LIGHT_BG : BG
  };color:${spec.light ? LIGHT_FG : FG}`;
  wrap.appendChild(canvas);
  const scene = spec.scene ?? "ocean";
  const roster = rosterFromGroups(
    spec.creatures,
    "stylized",
    createRng(spec.seed ^ 0x9e3779b9),
  ).entries;
  const world = new World({
    roster,
    seed: spec.seed,
    scene,
    baitFish: spec.baitFish ?? (scene === "pond" ? false : "auto"),
  });
  const renderer = new AsciiRenderer(canvas);
  renderer.setColors(spec.colors ?? "natural");
  renderer.setSurface(spec.surface ?? true);
  renderer.setScene(scene, spec.seed);
  renderer.setFontFamily(getComputedStyle(canvas).fontFamily);
  renderer.setPalette(readPalette(canvas));
  renderer.resize(LW, LH, spec.dpr ?? S);
  world.resize(LW, LH, renderer.cellWidth, renderer.cellHeight);
  const pre = Math.round((spec.preroll ?? 6) * FPS);
  for (let i = 0; i < pre; i++) {
    world.step(DT);
    // The last 1.5 s also render, so wakes and the swell are already running.
    if (i >= pre - 90) renderer.render(world, DT);
  }
  return {
    wrap,
    world,
    tick(render) {
      world.step(DT);
      if (render) renderer.render(world, DT);
    },
  };
}

type Specimen = { el: HTMLElement; tick(render: boolean): void };

/** One animal posed straight across its canvas and undulating in place, like the docs' Specimen. */
function makeSpecimen(
  parent: HTMLElement,
  species: CreatureSpecies,
  w: number,
  h: number,
  scale: number,
  css: string,
): Specimen {
  const wrap = div(parent, `position:absolute;${css};width:${w * scale}px;height:${h * scale}px`);
  const canvas = document.createElement("canvas");
  canvas.style.cssText = `display:block;width:${w}px;height:${h}px;transform-origin:0 0;transform:scale(${scale});font-family:${MONO};background:${BG};color:${FG}`;
  wrap.appendChild(canvas);
  const world = new World({ roster: [{ species, rel: 1, depth: 1 }], baitFish: false, seed: 1 });
  const renderer = new AsciiRenderer(canvas);
  renderer.setColors("natural");
  renderer.setScene("ocean", 1);
  renderer.setFontFamily(getComputedStyle(canvas).fontFamily);
  renderer.setPalette(readPalette(canvas));
  renderer.resize(w, h, Math.max(2, scale));
  world.resize(w, h, renderer.cellWidth, renderer.cellHeight);
  const L = Math.min(w * 0.62, h * 1.25);
  for (const sh of world.creatures) {
    sh.length = L;
    const seg = L / (SPINE_NODES - 1);
    sh.heading = 0;
    sh.speed = 40;
    sh.turn = 0;
    for (let k = 0; k < SPINE_NODES; k++) {
      sh.nodes[k * 2] = w / 2 + L / 2 - k * seg;
      sh.nodes[k * 2 + 1] = h / 2;
    }
  }
  return {
    el: wrap,
    tick(render) {
      for (const sh of world.creatures) sh.phase += DT * (2 + 40 / 24);
      if (render) renderer.render(world, DT);
    },
  };
}

const GRADIENT_LEFT = `position:absolute;inset:0;background:linear-gradient(90deg,rgba(12,10,17,.86) 0%,rgba(12,10,17,.5) 38%,rgba(12,10,17,0) 66%),linear-gradient(0deg,rgba(12,10,17,.7) 0%,rgba(12,10,17,0) 40%)`;
const KICKER = `font:500 15px/1 ${MONO};letter-spacing:.26em;text-transform:uppercase;color:${ACCENT}`;

// ── Scenes ──────────────────────────────────────────────────────────────────

type SceneRun = { frame(l: number, render: boolean): void };
type SceneDef = {
  start: number;
  end: number;
  /** Frames the scene's choreography is written in; it is played back squeezed into end − start. */
  span: number;
  chapter: string;
  mount(stage: HTMLElement): SceneRun;
};

/** 0 — Cold open: a line of text decodes, then the screen fills with glyphs. */
const coldOpen: SceneDef = {
  start: 0,
  end: CUTS[0],
  span: 330,
  chapter: "",
  mount(stage) {
    const field = document.createElement("canvas");
    field.width = W;
    field.height = H;
    field.style.cssText = "position:absolute;inset:0";
    stage.appendChild(field);
    const fctx = field.getContext("2d")!;
    const mono = getComputedStyle(field).fontFamily;
    const box = div(
      stage,
      `position:absolute;left:0;right:0;top:420px;text-align:center;color:${FG}`,
    );
    const line1 = div(box, `font:400 40px/1.2 ${MONO};color:${MUTED};height:56px`);
    const big = letters(
      box,
      "is made of text.",
      `font:500 124px/1.05 ${SANS};letter-spacing:-.045em;margin-top:18px`,
    );
    // "text." in the accent.
    big.spans.slice(11).forEach((s) => (s.style.color = ACCENT));
    const caret = div(
      stage,
      `position:absolute;left:${W / 2 - 12}px;top:${H / 2 - 30}px;width:24px;height:48px;background:${ACCENT}`,
    );
    const RAMP = " .:-=+*#%@";
    return {
      frame(l, render) {
        if (!render) return;
        caret.style.opacity = l < 42 && (l >> 4) % 2 === 0 ? "1" : "0";
        line1.textContent = scramble("Everything you're about to see", prog(l, 40, 100), l, 3);
        rise(big.spans, l, 104, 2, 46);
        const out = inCubic(prog(l, 250, 300));
        box.style.opacity = (1 - out).toFixed(3);
        box.style.filter = `blur(${(out * 8).toFixed(1)}px)`;
        // Glyph field: grows out from the centre in waves under the type.
        fctx.fillStyle = BG;
        fctx.fillRect(0, 0, W, H);
        const g = prog(l, 150, 320);
        if (g <= 0) return;
        fctx.font = `500 16px ${mono}`;
        fctx.textBaseline = "top";
        const cw = 16;
        const chh = 24;
        const reach = outCubic(g) * 1.25;
        for (let r = 0; r < H / chh; r++) {
          for (let c = 0; c < W / cw; c++) {
            const dx = (c * cw - W / 2) / (W / 2);
            const dy = (r * chh - H / 2) / (H / 2);
            const d = Math.hypot(dx, dy * 0.75);
            const front = clamp01((reach - d) / 0.35);
            if (front <= 0) continue;
            const wave =
              0.5 + 0.5 * Math.sin(c * 0.11 + r * 0.07 - l * 0.09 + Math.sin(r * 0.05) * 2);
            const n = (hash(c, r, l >> 3) % 100) / 100;
            const v = front * (0.25 + 0.75 * wave) * (0.6 + 0.4 * n);
            const k = Math.min(RAMP.length - 1, Math.floor(v * RAMP.length));
            if (k === 0) continue;
            fctx.fillStyle = `rgba(165,139,255,${(0.12 + v * 0.5).toFixed(3)})`;
            fctx.fillText(RAMP[k], c * cw, r * chh);
          }
        }
      },
    };
  },
};

/** 1 — Hero: an orca pod under the sun glitter, and the title. */
const hero: SceneDef = {
  start: CUTS[0],
  end: CUTS[1],
  span: 570,
  chapter: "01 — Open ocean",
  mount(stage) {
    const cam = div(stage, `position:absolute;inset:0;transform-origin:62% 50%`);
    const ocean = makeOcean(cam, {
      creatures: [{ species: "orca", count: 4 }],
      seed: 66,
      preroll: 9,
    });
    div(stage, GRADIENT_LEFT);
    const box = div(stage, `position:absolute;left:120px;top:575px;color:${FG}`);
    const kicker = div(box, KICKER);
    const title = letters(
      box,
      "ASCII Ocean",
      `font:500 184px/1 ${SANS};letter-spacing:-.055em;margin:22px 0 0 -8px`,
    );
    const sub = div(
      box,
      `font:400 30px/1.35 ${SANS};color:${MUTED};margin-top:20px`,
      "A living ocean, drawn entirely in characters.",
    );
    return {
      frame(l, render) {
        ocean.tick(render);
        if (!render) return;
        cam.style.transform = `scale(${(1 + 0.07 * inOutSine(l / 570)).toFixed(4)})`;
        kicker.textContent = scramble("A React canvas component", prog(l, 30, 75), l, 1);
        kicker.style.opacity = (1 - prog(l, 480, 500)).toFixed(3);
        rise(title.spans, l, 56, 3, 48, { at: 470, stagger: 2 });
        fade(sub, l, 110, 36, 476);
      },
    };
  },
};

/** 2 — Macro: the camera follows a great white and pushes in until single cells show. */
const macro: SceneDef = {
  start: CUTS[1],
  end: CUTS[2],
  span: 540,
  chapter: "02 — Made of text",
  mount(stage) {
    const cam = div(stage, `position:absolute;inset:0;transform-origin:0 0`);
    const ocean = makeOcean(cam, {
      creatures: [{ species: "classic" }],
      seed: 74,
      preroll: 8,
      dpr: 4.5,
    });
    div(stage, GRADIENT_LEFT);
    const shade = div(
      stage,
      "position:absolute;inset:0;background:linear-gradient(90deg,rgba(12,10,17,.92) 0%,rgba(12,10,17,.8) 30%,rgba(12,10,17,0) 52%)",
    );
    const shark = ocean.world.creatures.find((c) => c.species === "classic")!;
    const node = Math.floor(SPINE_NODES * 0.28);
    let fx = shark.nodes[node * 2] * S;
    let fy = shark.nodes[node * 2 + 1] * S;
    const ZMAX = 2.7;

    const reticle = div(
      stage,
      `position:absolute;border:2px solid ${ACCENT};box-shadow:0 0 0 1px rgba(12,10,17,.6)`,
    );
    const leader = div(
      stage,
      `position:absolute;height:1.5px;background:${ACCENT};transform-origin:0 50%`,
    );
    const tag = div(
      stage,
      `position:absolute;font:500 18px/1.4 ${MONO};color:${FG};background:rgba(12,10,17,.82);padding:10px 14px;border:1px solid ${FAINT};white-space:nowrap`,
    );
    const box = div(stage, `position:absolute;left:120px;top:300px;color:${FG}`);
    const lines = ["No sprites.", "No SVG.", "No WebGL."].map((t) =>
      letters(box, t, `font:500 96px/1.08 ${SANS};letter-spacing:-.045em;color:${MUTED}`),
    );
    const just = letters(
      box,
      "Just characters.",
      `font:500 96px/1.08 ${SANS};letter-spacing:-.045em;color:${ACCENT};margin-top:14px`,
    );
    const readout = div(
      stage,
      `position:absolute;left:120px;bottom:118px;font:500 15px/1 ${MONO};letter-spacing:.08em;color:${MUTED}`,
    );
    return {
      frame(l, render) {
        ocean.tick(render);
        // A soft follow: the camera eases towards the shark's shoulders.
        fx += (shark.nodes[node * 2] * S - fx) * 0.06;
        fy += (shark.nodes[node * 2 + 1] * S - fy) * 0.06;
        if (!render) return;
        const zin = inOutCubic(prog(l, 40, 210));
        const zout = inOutCubic(prog(l, 410, 500));
        const z = 1 + (ZMAX - 1) * zin * (1 - zout);
        const a = (z - 1) / (ZMAX - 1);
        const cx = lerp(W / 2, fx, a);
        const cy = lerp(H / 2, fy, a);
        // Zoomed in, the shark sits right of centre so the type on the left stays clear.
        const tx = Math.min(0, Math.max(W - z * W, lerp(W / 2, W * 0.66, a) - z * cx));
        const ty = Math.min(0, Math.max(H - z * H, H / 2 - z * cy));
        cam.style.transform = `translate3d(${tx.toFixed(2)}px,${ty.toFixed(2)}px,0) scale(${z.toFixed(4)})`;

        // The cell under the shark's shoulders, snapped to the renderer's grid (10 × 15 layout px).
        const cell = 10 * S * z;
        const cellH = 15 * S * z;
        const col = Math.floor(fx / (10 * S));
        const row = Math.floor(fy / (15 * S));
        const bx = tx + col * cell;
        const by = ty + row * cellH;
        const show = outExpo(prog(l, 215, 245)) * (1 - inCubic(prog(l, 395, 412)));
        const grow = 1 + (1 - outExpo(prog(l, 215, 250))) * 1.6;
        reticle.style.opacity = show.toFixed(3);
        reticle.style.left = `${(bx - (cell * (grow - 1)) / 2).toFixed(1)}px`;
        reticle.style.top = `${(by - (cellH * (grow - 1)) / 2).toFixed(1)}px`;
        reticle.style.width = `${(cell * grow).toFixed(1)}px`;
        reticle.style.height = `${(cellH * grow).toFixed(1)}px`;
        const lx = bx + cell + 8;
        const ly = by + cellH / 2;
        const reach = 150 * outExpo(prog(l, 235, 270));
        leader.style.opacity = show.toFixed(3);
        leader.style.left = `${lx.toFixed(1)}px`;
        leader.style.top = `${ly.toFixed(1)}px`;
        leader.style.width = `${reach.toFixed(1)}px`;
        tag.style.opacity = (show * prog(l, 255, 275)).toFixed(3);
        tag.style.left = `${(lx + reach + 10).toFixed(1)}px`;
        tag.style.top = `${(ly - 24).toFixed(1)}px`;
        tag.textContent = scramble("1 cell = 1 character", prog(l, 255, 290), l, 9);

        lines.forEach((ln, i) => rise(ln.spans, l, 230 + i * 26, 2, 40, { at: 400, stagger: 1 }));
        rise(just.spans, l, 318, 2, 44, { at: 404, stagger: 1 });
        shade.style.opacity = (prog(l, 200, 240) * (1 - prog(l, 400, 440))).toFixed(3);
        readout.style.opacity = (prog(l, 60, 90) * (1 - prog(l, 470, 500))).toFixed(3);
        readout.textContent = `ZOOM ${z.toFixed(2)}×   GRID 128 × 48 = 6,144 CELLS   REDRAWN EVERY FRAME`;
      },
    };
  },
};

const ORDER: CreatureSpecies[] = [
  "classic",
  "mako",
  "tiger",
  "thresher",
  "hammerhead",
  "greathammer",
  "nurse",
  "zebra",
  "bottlenose",
  "orca",
  "humpback",
  "koi",
];
/** One card per 60 span frames: squeezed into the scene, that is 48 frames, two beats at 150 BPM. */
const CARD = 60;
const GRID_AT = ORDER.length * CARD;

/** 3 — Species: a rapid roll call with a real-length ruler, then all twelve in a grid. */
const species: SceneDef = {
  start: CUTS[2],
  end: CUTS[3],
  span: 960,
  chapter: "03 — Twelve species",
  mount(stage) {
    const ghost = div(
      stage,
      `position:absolute;right:90px;top:120px;font:500 420px/1 ${SANS};letter-spacing:-.06em;color:rgba(165,139,255,.07)`,
    );
    const cards = ORDER.map((sp) => makeSpecimen(stage, sp, 860, 373, S, "left:315px;top:110px"));
    const index = div(stage, `position:absolute;left:120px;top:150px;${KICKER}`);
    const name = div(
      stage,
      `position:absolute;left:120px;top:700px;font:500 104px/1 ${SANS};letter-spacing:-.05em;color:${FG};white-space:nowrap`,
    );
    const meta = div(
      stage,
      `position:absolute;left:124px;top:826px;font:500 20px/1 ${MONO};color:${MUTED};letter-spacing:.04em`,
    );
    // Real-length ruler, 0–14 m.
    const ruler = div(stage, `position:absolute;left:120px;top:910px;width:1680px;height:40px`);
    div(ruler, `position:absolute;left:0;right:0;top:0;height:1px;background:${FAINT}`);
    for (let m = 0; m <= 14; m++) {
      div(
        ruler,
        `position:absolute;left:${(m / 14) * 1680}px;top:0;width:1px;height:${m % 2 === 0 ? 12 : 6}px;background:${FAINT}`,
      );
      if (m % 2 === 0)
        div(
          ruler,
          `position:absolute;left:${(m / 14) * 1680 - 20}px;width:40px;text-align:center;top:20px;font:500 12px/1 ${MONO};color:${MUTED}`,
          `${m}m`,
        );
    }
    const fill = div(ruler, `position:absolute;left:0;top:-1px;height:3px;background:${ACCENT}`);
    const fillTag = div(
      ruler,
      `position:absolute;top:-32px;font:500 14px/1 ${MONO};color:${ACCENT};white-space:nowrap`,
    );

    // The grid finale.
    const grid = div(stage, "position:absolute;inset:0");
    const head = letters(
      grid,
      "Twelve species. One renderer.",
      `position:absolute;left:120px;top:96px;font:500 60px/1 ${SANS};letter-spacing:-.04em;color:${FG}`,
    );
    const GW = 405;
    const GH = 190;
    const cells = ORDER.map((sp, i) => {
      const c = i % 4;
      const r = Math.floor(i / 4);
      const cell = div(
        grid,
        `position:absolute;left:${120 + c * (GW + 20)}px;top:${212 + r * (GH + 56)}px;width:${GW}px;height:${GH + 36}px`,
      );
      const frame = div(
        cell,
        `position:absolute;left:0;top:0;width:${GW}px;height:${GH}px;border:1px solid ${FAINT};border-radius:12px;overflow:hidden`,
      );
      const spec = makeSpecimen(frame, sp, GW, GH, 1, "left:0;top:0");
      div(
        cell,
        `position:absolute;left:2px;top:${GH + 12}px;font:500 14px/1 ${MONO};color:${MUTED};letter-spacing:.04em`,
        `${String(i + 1).padStart(2, "0")}  ${SPECIES_NAMES[sp]}`,
      );
      return { cell, spec, order: c + r };
    });

    let shownLen = 0;
    return {
      frame(l, render) {
        const i = Math.min(ORDER.length - 1, Math.floor(l / CARD));
        const inGrid = l >= GRID_AT;
        if (!inGrid) cards[i].tick(render);
        else for (const c of cells) c.spec.tick(render);
        if (!render) return;
        const local = l - i * CARD;
        const sp = ORDER[i];
        cards.forEach((c, k) => (c.el.style.display = !inGrid && k === i ? "block" : "none"));
        const slide = outExpo(prog(local, 0, 26));
        cards[i].el.style.transform =
          `translate3d(${((1 - slide) * 160 - local * 0.6).toFixed(1)}px,0,0)`;
        cards[i].el.style.opacity = slide.toFixed(3);

        const cardUi = 1 - prog(l, GRID_AT - 10, GRID_AT);
        for (const el of [index, name, meta, ruler, ghost]) el.style.opacity = cardUi.toFixed(3);
        index.textContent = `${String(i + 1).padStart(2, "0")} / 12`;
        ghost.textContent = String(i + 1).padStart(2, "0");
        name.textContent = scramble(SPECIES_NAMES[sp], prog(local, 0, 18), l, i);
        const len = CREATURES[sp].realLength;
        meta.textContent = `species="${sp}"   ≈ ${len} m`;
        const prev = i > 0 ? CREATURES[ORDER[i - 1]].realLength : 0;
        shownLen = lerp(prev, len, outExpo(prog(local, 0, 28)));
        fill.style.width = `${((shownLen / 14) * 1680).toFixed(1)}px`;
        fillTag.style.left = `${((shownLen / 14) * 1680 - 4).toFixed(1)}px`;
        fillTag.textContent = `${shownLen.toFixed(shownLen < 1 ? 2 : 1)} m`;

        const g = l - GRID_AT;
        grid.style.display = inGrid ? "block" : "none";
        if (inGrid) {
          rise(head.spans, g, 4, 1, 40);
          for (const c of cells) {
            const p = outExpo(prog(g, 4 + c.order * 5, 40 + c.order * 5));
            const out = inCubic(prog(g, 214, 236));
            c.cell.style.opacity = (p * (1 - out)).toFixed(3);
            c.cell.style.transform = `translate3d(0,${((1 - p) * 30).toFixed(1)}px,0) scale(${(0.94 + 0.06 * p - out * 0.04).toFixed(4)})`;
          }
          head.line.style.opacity = (1 - inCubic(prog(g, 212, 236))).toFixed(3);
        }
      },
    };
  },
};

/** 4 — Koi pond: lily pads, duckweed and six koi coats. */
const pond: SceneDef = {
  start: CUTS[3],
  end: CUTS[4],
  span: 600,
  chapter: "04 — Koi pond",
  mount(stage) {
    const cam = div(stage, `position:absolute;inset:0;transform-origin:70% 45%`);
    const ocean = makeOcean(cam, {
      creatures: [
        {
          species: "koi",
          count: 7,
          variety: ["kohaku", "sanke", "showa", "tancho", "ogon", "asagi"],
        },
      ],
      scene: "pond",
      seed: 21,
      preroll: 10,
    });
    div(stage, GRADIENT_LEFT);
    const box = div(stage, `position:absolute;left:120px;top:560px;color:${FG}`);
    const kicker = div(box, KICKER);
    const l1 = letters(
      box,
      "Koi glide",
      `font:500 110px/1.04 ${SANS};letter-spacing:-.05em;margin-top:22px`,
    );
    const l2 = letters(
      box,
      "under lily pads.",
      `font:500 110px/1.04 ${SANS};letter-spacing:-.05em`,
    );
    const coats = div(
      box,
      `font:500 18px/1 ${MONO};color:${MUTED};margin-top:30px;letter-spacing:.06em`,
    );
    return {
      frame(l, render) {
        ocean.tick(render);
        if (!render) return;
        cam.style.transform = `scale(${(1.14 - 0.14 * inOutSine(l / 600)).toFixed(4)})`;
        kicker.textContent = scramble('scene="pond"', prog(l, 24, 60), l, 4);
        kicker.style.opacity = (1 - prog(l, 520, 540)).toFixed(3);
        rise(l1.spans, l, 40, 2, 46, { at: 516 });
        rise(l2.spans, l, 60, 2, 46, { at: 522 });
        coats.textContent = scramble(
          "kohaku · sanke · showa · tancho · ogon · asagi",
          prog(l, 140, 210),
          l,
          8,
        );
        coats.style.opacity = (1 - prog(l, 520, 540)).toFixed(3);
      },
    };
  },
};

/** 5 — One seed, three looks: the same world in natural, theme-dark and theme-light, split by slanted panels. */
const themes: SceneDef = {
  start: CUTS[4],
  end: CUTS[5],
  span: 600,
  chapter: "05 — One seed, any theme",
  mount(stage) {
    const roster: CreatureGroup[] = [
      { species: "classic" },
      { species: "hammerhead" },
      { species: "tiger" },
      { species: "bottlenose", count: 2 },
    ];
    const looks = [
      { colors: "natural" as const, light: false, label: 'colors="natural"' },
      { colors: "theme" as const, light: false, grade: "none", label: 'colors="theme"  ·  dark' },
      { colors: "theme" as const, light: true, grade: "none", label: 'colors="theme"  ·  light' },
    ];
    const panels = looks.map((look) => {
      const panel = div(stage, "position:absolute;inset:0");
      const ocean = makeOcean(panel, { creatures: roster, seed: 39, preroll: 7, ...look });
      return { panel, ocean };
    });
    const dividers = [0, 1].map(() =>
      div(
        stage,
        `position:absolute;top:-40px;width:2px;height:${H + 80}px;background:${FG};transform-origin:50% 50%`,
      ),
    );
    const tags = looks.map((look) =>
      div(
        stage,
        `position:absolute;top:118px;font:500 16px/1 ${MONO};padding:9px 12px;border-radius:6px;white-space:nowrap;background:rgba(12,10,17,.78);color:${FG};border:1px solid ${FAINT}`,
        look.label,
      ),
    );
    const caption = div(
      stage,
      `position:absolute;left:0;right:0;bottom:120px;text-align:center;color:${FG}`,
    );
    const head = letters(
      caption,
      "One seed. Any theme.",
      `display:inline-block;font:500 92px/1 ${SANS};letter-spacing:-.05em;padding:18px 34px 22px;background:rgba(12,10,17,.82);border-radius:18px`,
    );
    const sub = div(
      caption,
      `font:500 18px/1 ${MONO};color:${FG};margin:18px auto 0;letter-spacing:.04em;display:table;background:rgba(12,10,17,.82);padding:10px 14px;border-radius:6px`,
      "seed={39}  →  the same ocean, frame for frame",
    );
    const SLANT = 120;
    return {
      frame(l, render) {
        for (const p of panels) p.ocean.tick(render);
        if (!render) return;
        // Divider positions sweep in from the right edge, then back out.
        const back = inOutCubic(prog(l, 500, 560));
        const x1 = lerp(W + SLANT * 2, W / 3, outExpo(prog(l, 50, 120)) * (1 - back));
        const x2 = lerp(W + SLANT * 2, (2 * W) / 3, outExpo(prog(l, 130, 200)) * (1 - back));
        const xs = [x1, x2];
        const clip = (a: number, b: number) =>
          `polygon(${a + SLANT}px 0, ${b + SLANT}px 0, ${b - SLANT}px ${H}px, ${a - SLANT}px ${H}px)`;
        panels[0].panel.style.clipPath = clip(-SLANT * 2, x1);
        panels[1].panel.style.clipPath = clip(x1, x2);
        panels[2].panel.style.clipPath = clip(x2, W + SLANT * 2);
        const angle = (Math.atan2(2 * SLANT, H) * 180) / Math.PI;
        dividers.forEach((d, i) => {
          d.style.left = `${xs[i] - 1}px`;
          d.style.transform = `rotate(${angle.toFixed(3)}deg)`;
        });
        const lefts = [0, x1, x2];
        const rights = [x1, x2, W];
        tags.forEach((t, i) => {
          const vis = rights[i] - lefts[i] > 240 ? 1 : 0;
          const p =
            outExpo(prog(l, [20, 110, 190][i], [50, 140, 220][i])) * (1 - prog(l, 495, 515));
          t.style.opacity = (vis * p).toFixed(3);
          t.style.left = `${(lefts[i] + SLANT * 0.55 + 70).toFixed(1)}px`;
        });
        rise(head.spans, l, 230, 2, 44, { at: 470 });
        fade(head.line, l, 222, 20, 488, 0);
        fade(sub, l, 290, 30, 470);
      },
    };
  },
};

/** 6 — Sea surface: a scan line turns the surface on, and the layers are named. */
const surface: SceneDef = {
  start: CUTS[5],
  end: CUTS[6],
  span: 600,
  chapter: "06 — Sea surface",
  mount(stage) {
    const roster: CreatureGroup[] = [{ species: "humpback" }, { species: "bottlenose", count: 2 }];
    const off = div(stage, "position:absolute;inset:0");
    const on = div(stage, "position:absolute;inset:0");
    const oceans = [
      makeOcean(off, {
        creatures: roster,
        seed: 2,
        preroll: 7,
        surface: false,
        grade: SURFACE_GRADE,
      }),
      makeOcean(on, {
        creatures: roster,
        seed: 2,
        preroll: 7,
        surface: true,
        grade: SURFACE_GRADE,
      }),
    ];
    const scan = div(
      stage,
      `position:absolute;top:0;width:2px;height:${H}px;background:${ACCENT};box-shadow:0 0 24px 4px rgba(165,139,255,.55)`,
    );
    const scanTag = div(
      stage,
      `position:absolute;top:140px;font:500 16px/1 ${MONO};color:${BG};background:${ACCENT};padding:8px 11px;border-radius:5px;white-space:nowrap`,
      "surface={true}",
    );
    const offTag = div(
      stage,
      `position:absolute;right:120px;top:140px;font:500 16px/1 ${MONO};color:${FG};background:rgba(12,10,17,.78);border:1px solid ${FAINT};padding:8px 11px;border-radius:5px`,
      "surface={false}",
    );
    div(stage, GRADIENT_LEFT);
    const box = div(stage, `position:absolute;left:120px;top:470px;color:${FG}`);
    const kicker = div(box, KICKER);
    const l1 = letters(
      box,
      "Real ocean optics,",
      `font:500 92px/1.06 ${SANS};letter-spacing:-.05em;margin-top:22px`,
    );
    const l2 = letters(
      box,
      "in text.",
      `font:500 92px/1.06 ${SANS};letter-spacing:-.05em;color:${ACCENT}`,
    );
    const list = div(box, "margin-top:40px");
    const items = ["14-component directional swell", "Sun glitter", "Wind rows", "Whitecaps"].map(
      (t, i) => {
        const row = div(
          list,
          `display:flex;gap:18px;align-items:baseline;font:400 26px/1.7 ${SANS};color:${FG};border-top:1px solid ${FAINT};width:620px`,
        );
        div(
          row,
          `font:500 14px/1 ${MONO};color:${ACCENT};width:28px`,
          String(i + 1).padStart(2, "0"),
        );
        div(row, "", t);
        return row;
      },
    );
    return {
      frame(l, render) {
        for (const o of oceans) o.tick(render);
        if (!render) return;
        const sx = lerp(-40, W + 40, inOutCubic(prog(l, 70, 250)));
        on.style.clipPath = `inset(0 ${Math.max(0, W - sx).toFixed(1)}px 0 0)`;
        scan.style.left = `${sx.toFixed(1)}px`;
        const scanVis = prog(l, 60, 80) * (1 - prog(l, 240, 260));
        scan.style.opacity = scanVis.toFixed(3);
        scanTag.style.left = `${(sx - 168).toFixed(1)}px`;
        scanTag.style.opacity = scanVis.toFixed(3);
        offTag.style.opacity = (prog(l, 20, 40) * (1 - prog(l, 200, 220))).toFixed(3);
        kicker.textContent = scramble("surface={true}", prog(l, 250, 290), l, 6);
        kicker.style.opacity = (1 - prog(l, 530, 550)).toFixed(3);
        rise(l1.spans, l, 262, 2, 44, { at: 520 });
        rise(l2.spans, l, 290, 2, 44, { at: 526 });
        items.forEach((it, i) => fade(it, l, 330 + i * 14, 30, 520 + i * 3, 18));
      },
    };
  },
};

/** 7 — Interaction: a cursor parts a school of bait fish, then splashes the water. */
const interaction: SceneDef = {
  start: CUTS[6],
  end: CUTS[7],
  span: 480,
  chapter: "07 — Interaction",
  mount(stage) {
    const ocean = makeOcean(stage, {
      creatures: [{ species: "bottlenose" }],
      seed: 55,
      preroll: 8,
      baitFish: 3,
      grade: "brightness(1.6) saturate(1.3)",
    });
    const world = ocean.world;
    // Find the two densest patches of bait fish to steer the cursor through.
    const GX = 8;
    const GY = 5;
    const counts = new Array(GX * GY).fill(0);
    for (const f of world.fish) {
      if (!f.alive) continue;
      const gx = Math.min(GX - 1, Math.max(0, Math.floor((f.x / LW) * GX)));
      const gy = Math.min(GY - 1, Math.max(0, Math.floor((f.y / LH) * GY)));
      counts[gx + gy * GX]++;
    }
    // Only the right of the frame: the type sits on the left.
    const order = counts
      .map((c, i) => [c, i])
      .filter(([, i]) => i % GX >= 3)
      .sort((a, b) => b[0] - a[0]);
    const centre = (i: number) => [
      ((i % GX) + 0.5) * (W / GX),
      (Math.floor(i / GX) + 0.5) * (H / GY),
    ];
    const d1 = centre(order[0][1]);
    let d2 = centre(order[1][1]);
    for (const [, i] of order) {
      const c = centre(i);
      if (Math.hypot(c[0] - d1[0], c[1] - d1[1]) > 420) {
        d2 = c;
        break;
      }
    }
    const [a, b] = d1[0] < d2[0] ? [d1, d2] : [d2, d1];
    const keys: [number, number[]][] = [
      [10, [W + 60, H * 0.86]],
      [130, a],
      [250, b],
      [292, b],
      [336, [W * 0.6, H * 0.36]],
      [372, [W * 0.6, H * 0.36]],
      [414, [W * 0.78, H * 0.62]],
      [480, [W * 0.78, H * 0.62]],
    ];
    const clicks = [270, 352, 430];
    let prevL = -1;
    const cursorAt = (l: number) => {
      if (l <= keys[0][0]) return keys[0][1];
      for (let k = 1; k < keys.length; k++) {
        if (l <= keys[k][0]) {
          const t = inOutCubic(prog(l, keys[k - 1][0], keys[k][0]));
          return [
            lerp(keys[k - 1][1][0], keys[k][1][0], t),
            lerp(keys[k - 1][1][1], keys[k][1][1], t),
          ];
        }
      }
      return keys[keys.length - 1][1];
    };
    const rings = clicks.map(() =>
      div(
        stage,
        `position:absolute;width:420px;height:420px;margin:-210px 0 0 -210px;border:2px solid ${FG};border-radius:50%;opacity:0;box-shadow:0 0 0 18px rgba(165,139,255,.12)`,
      ),
    );
    const halo = div(
      stage,
      // The fish's real flee radius: 130 layout px.
      `position:absolute;width:${260 * S}px;height:${260 * S}px;margin:${-130 * S}px 0 0 ${-130 * S}px;border-radius:50%;border:1px dashed rgba(242,240,247,.35)`,
    );
    const cursor = div(stage, "position:absolute;width:34px;height:34px;transform-origin:4px 4px");
    cursor.innerHTML = `<svg width="34" height="34" viewBox="0 0 24 24"><path d="M4 2.5 L4 19 L8.6 14.8 L11.5 21.4 L14.4 20.1 L11.6 13.6 L17.8 13.4 Z" fill="${FG}" stroke="${BG}" stroke-width="1.4" stroke-linejoin="round"/></svg>`;
    div(stage, GRADIENT_LEFT.replace(".86", ".7"));
    const box = div(stage, `position:absolute;left:120px;top:640px;color:${FG}`);
    const kicker = div(box, KICKER);
    const l1 = letters(
      box,
      "Hover parts the school.",
      `font:500 84px/1.08 ${SANS};letter-spacing:-.045em;margin-top:22px`,
    );
    const l2 = letters(
      box,
      "Click to splash.",
      `font:500 84px/1.08 ${SANS};letter-spacing:-.045em;color:${ACCENT}`,
    );
    return {
      frame(l, render) {
        const [cx, cy] = cursorAt(l);
        world.pointer.x = cx / S;
        world.pointer.y = cy / S;
        world.pointer.active = l > 10 && cx > 0;
        for (const c of clicks) if (prevL < c && l >= c) world.splash(cx / S, cy / S);
        prevL = l;
        ocean.tick(render);
        if (!render) return;
        let press = 1;
        clicks.forEach((c, i) => {
          const p = prog(l, c, c + 40);
          const ring = rings[i];
          if (l >= c && l < c + 40) {
            const k = keys.find((kk) => kk[0] >= c)![1];
            ring.style.left = `${k[0]}px`;
            ring.style.top = `${k[1]}px`;
            ring.style.opacity = (1 - p).toFixed(3);
            ring.style.transform = `scale(${(0.1 + outExpo(p) * 0.9).toFixed(3)})`;
          } else ring.style.opacity = "0";
          if (l >= c - 4 && l < c + 8) press = 0.82;
        });
        cursor.style.left = `${cx - 4}px`;
        cursor.style.top = `${cy - 4}px`;
        cursor.style.transform = `scale(${press})`;
        halo.style.left = `${cx}px`;
        halo.style.top = `${cy}px`;
        halo.style.opacity = (0.8 * prog(l, 20, 50) * (1 - prog(l, 250, 270))).toFixed(3);
        kicker.textContent = scramble('interaction="splash"', prog(l, 20, 60), l, 7);
        kicker.style.opacity = (1 - prog(l, 446, 466)).toFixed(3);
        rise(l1.spans, l, 36, 2, 44, { at: 444 });
        rise(l2.spans, l, 262, 2, 40, { at: 448 });
      },
    };
  },
};

/** 8 — End card: the wordmark and the install command, then the glyphs close over everything. */
const endCard: SceneDef = {
  start: CUTS[7],
  end: TOTAL,
  span: 300,
  chapter: "",
  mount(stage) {
    const bgWrap = div(stage, "position:absolute;inset:0");
    const ocean = makeOcean(bgWrap, {
      creatures: [{ species: "orca", count: 4 }],
      seed: 66,
      preroll: 30,
    });
    div(
      stage,
      "position:absolute;inset:0;background:radial-gradient(ellipse at 50% 50%,rgba(12,10,17,.62) 0%,rgba(12,10,17,.86) 70%)",
    );
    const box = div(
      stage,
      `position:absolute;left:0;right:0;top:360px;text-align:center;color:${FG}`,
    );
    const mark = letters(
      box,
      "ASCII Ocean",
      `display:inline-block;font:500 168px/1 ${SANS};letter-spacing:-.055em;margin-top:26px`,
    );
    const cmd = div(
      box,
      `display:table;margin:48px auto 0;padding:20px 28px;border:1px solid ${FAINT};border-radius:12px;background:rgba(12,10,17,.85);font:500 24px/1 ${MONO};color:${FG};white-space:pre;text-align:left`,
    );
    const CMD = "npx shadcn@latest add https://www.huanngdev.site/r/ascii-ocean.json";
    return {
      frame(l, render) {
        ocean.tick(render);
        if (!render) return;
        rise(mark.spans, l, 4, 3, 50);
        fade(cmd, l, 40, 24);
        const typed = CMD.slice(0, Math.floor(CMD.length * prog(l, 52, 120)));
        cmd.innerHTML = `<span style="color:${ACCENT}">$ </span>${typed}<span style="display:inline-block;width:12px;height:26px;vertical-align:-5px;background:${ACCENT};opacity:${(l >> 4) % 2 === 0 || typed.length < CMD.length ? 1 : 0}"></span>`;
      },
    };
  },
};

const SCENES = [coldOpen, hero, macro, species, pond, themes, surface, interaction, endCard];

// ── Glyph wipe ──────────────────────────────────────────────────────────────

type WipeKind = { dir: [number, number] } | { radial: true };
const WIPES: WipeKind[] = [
  { radial: true },
  { dir: [1, 0.35] },
  { dir: [-1, 0.2] },
  { dir: [0.2, 1] },
  { dir: [1, -0.4] },
  { dir: [-1, 0] },
  { radial: true },
  { dir: [1, 0.5] },
];
const RAMP = " .:-=+*#%@";

/** Coverage 0→1→0 for a cell at normalised sweep position u, wipe progress q. */
function cover(q: number, u: number, through: boolean) {
  const cin = clamp01((q - u * 0.28) / 0.18);
  const cout = through ? clamp01((q - 0.5 - u * 0.28) / 0.18) : 0;
  return cin - cout;
}

function drawWipe(ctx: CanvasRenderingContext2D, f: number, mono: string) {
  ctx.clearRect(0, 0, W, H);
  const active: { q: number; kind: WipeKind; salt: number; through: boolean }[] = [];
  CUTS.forEach((c, i) => {
    if (Math.abs(f - c) <= WIPE_HALF)
      active.push({
        q: (f - (c - WIPE_HALF)) / (2 * WIPE_HALF),
        kind: WIPES[i],
        salt: c,
        through: true,
      });
  });
  // The outro closes the glyphs over the end card and stays shut.
  if (f >= OUTRO)
    active.push({
      q: Math.min(0.5, ((f - OUTRO) / 44) * 0.5),
      kind: { radial: true },
      salt: 7,
      through: false,
    });
  if (active.length === 0) return;
  const cw = 20;
  const chh = 30;
  ctx.font = `600 20px ${mono}`;
  ctx.textBaseline = "top";
  for (const w of active) {
    for (let r = 0; r < H / chh; r++) {
      for (let c = 0; c < W / cw; c++) {
        const x = c * cw;
        const y = r * chh;
        let u: number;
        if ("radial" in w.kind) {
          u = Math.hypot((x - W / 2) / (W / 2), (y - H / 2) / (W / 2)) / 1.16;
          if (!w.through) u = 1 - u;
        } else {
          const [dx, dy] = w.kind.dir;
          const nx = dx >= 0 ? x / W : 1 - x / W;
          const ny = dy >= 0 ? y / H : 1 - y / H;
          u = (nx * Math.abs(dx) + ny * Math.abs(dy)) / (Math.abs(dx) + Math.abs(dy));
        }
        u += ((hash(c, r, w.salt) % 1000) / 1000) * 0.12;
        const v = cover(w.q, u, w.through);
        if (v <= 0) continue;
        if (v >= 1) {
          ctx.fillStyle = BG;
          ctx.fillRect(x, y, cw, chh);
          continue;
        }
        ctx.fillStyle = `rgba(12,10,17,${Math.min(1, v * 1.25).toFixed(3)})`;
        ctx.fillRect(x, y, cw, chh);
        const k = Math.max(1, Math.min(RAMP.length - 1, Math.floor(v * RAMP.length)));
        ctx.fillStyle =
          v > 0.55
            ? `rgba(165,139,255,${(1.4 - v).toFixed(3)})`
            : `rgba(242,240,247,${(0.4 + v).toFixed(3)})`;
        ctx.fillText(RAMP[k], x + 4, y + 4);
      }
    }
  }
}

// ── HUD ─────────────────────────────────────────────────────────────────────

function makeHud(root: HTMLElement) {
  const hud = div(root, "position:absolute;inset:0;pointer-events:none");
  const corner = (css: string) => div(hud, `position:absolute;width:26px;height:26px;${css}`);
  const edge = `1px solid rgba(242,240,247,.4)`;
  corner(`left:40px;top:40px;border-left:${edge};border-top:${edge}`);
  corner(`right:40px;top:40px;border-right:${edge};border-top:${edge}`);
  corner(`left:40px;bottom:40px;border-left:${edge};border-bottom:${edge}`);
  corner(`right:40px;bottom:40px;border-right:${edge};border-bottom:${edge}`);
  const label = `position:absolute;font:500 13px/1 ${MONO};letter-spacing:.22em;text-transform:uppercase;color:rgba(242,240,247,.7)`;
  div(hud, `${label};left:84px;top:47px`, "ASCII Ocean — Showreel");
  const tc = div(hud, `${label};right:84px;top:47px;font-variant-numeric:tabular-nums`);
  const chapter = div(hud, `${label};left:84px;bottom:47px;color:${ACCENT}`);
  div(hud, `${label};right:84px;bottom:47px`, "huanngdev.site");
  const track = div(
    hud,
    `position:absolute;left:84px;right:84px;bottom:76px;height:1px;background:rgba(242,240,247,.12)`,
  );
  const bar = div(track, `position:absolute;left:0;top:0;bottom:0;background:${ACCENT}`);
  let lastChapter = "";
  let changedAt = 0;
  return (f: number) => {
    hud.style.opacity = (prog(f, 170, 200) * (1 - prog(f, OUTRO, OUTRO + 30))).toFixed(3);
    const s = Math.floor(f / FPS);
    const pad = (n: number) => String(n).padStart(2, "0");
    tc.textContent = `${pad(Math.floor(s / 60))}:${pad(s % 60)}:${pad(f % FPS)}  ·  F ${String(f).padStart(4, "0")}`;
    bar.style.width = `${((f / (TOTAL - 1)) * 100).toFixed(3)}%`;
    const scene = SCENES.find((sc) => f >= sc.start && f < sc.end)!;
    if (scene.chapter !== lastChapter) {
      lastChapter = scene.chapter;
      changedAt = f;
    }
    chapter.textContent = scramble(lastChapter, prog(f, changedAt + 10, changedAt + 40), f, 11);
  };
}

// ── Driver ──────────────────────────────────────────────────────────────────

/** Scale punch for frame f, matching the kick pattern: none in the intro, half time under the koi and at the end. */
function punch(f: number) {
  if (f < CUTS[0] || f >= TOTAL - 96) return 0;
  const half = (f >= CUTS[3] && f < CUTS[4]) || f >= CUTS[7];
  const b = f % (half ? BEAT * 2 : BEAT);
  return 0.011 * Math.exp(-b / 5);
}

declare global {
  interface Window {
    __reel?: { ready: Promise<void>; total: number; fps: number; seek(f: number): void };
  }
}

export function mountReel(host: HTMLElement, params: URLSearchParams) {
  const style = document.createElement("style");
  style.textContent = "nextjs-portal{display:none!important}html,body{overflow:hidden!important}";
  document.head.appendChild(style);
  const root = div(
    host,
    `position:fixed;left:0;top:0;width:${W}px;height:${H}px;overflow:hidden;background:${BG};z-index:2147483647;color:${FG};font-family:${SANS}`,
  );
  const sceneLayer = div(root, "position:absolute;inset:0;overflow:hidden");
  const wipe = document.createElement("canvas");
  wipe.width = W;
  wipe.height = H;
  wipe.style.cssText = "position:absolute;inset:0";
  root.appendChild(wipe);
  const wctx = wipe.getContext("2d")!;
  const flash = div(
    root,
    `position:absolute;inset:0;background:${FG};opacity:0;pointer-events:none`,
  );
  const probe = div(root, `font-family:${MONO};position:absolute;opacity:0`, "x");
  const mono = getComputedStyle(probe).fontFamily;
  const hud = makeHud(root);

  let cur: { def: SceneDef; run: SceneRun; last: number } | null = null;
  const seek = (f: number) => {
    const def = SCENES.find((s) => f >= s.start && f < s.end) ?? SCENES[SCENES.length - 1];
    if (!cur || cur.def !== def || f <= cur.last) {
      sceneLayer.replaceChildren();
      const stage = div(sceneLayer, "position:absolute;inset:0;overflow:hidden");
      cur = { def, run: def.mount(stage), last: def.start - 1 };
    }
    const k = def.span / (def.end - def.start);
    while (cur.last < f) {
      cur.last++;
      cur.run.frame((cur.last - def.start) * k, cur.last === f);
    }
    // A punch on every kick: the picture breathes with the soundtrack.
    const p = punch(f);
    sceneLayer.style.transform = p > 0.0005 ? `scale(${(1 + p).toFixed(4)})` : "";
    const since = Math.min(...CUTS.map((c) => (f >= c ? f - c : Infinity)));
    flash.style.opacity = since < 14 ? (0.16 * Math.exp(-since / 3.5)).toFixed(3) : "0";
    hud(f);
    drawWipe(wctx, f, mono);
  };

  const ready = Promise.all([
    document.fonts.load(`500 20px ${mono}`),
    document.fonts.load(`500 40px ${getComputedStyle(root).fontFamily}`),
    document.fonts.load(`400 40px ${getComputedStyle(root).fontFamily}`),
  ]).then(() => document.fonts.ready.then(() => undefined));
  window.__reel = { ready, total: TOTAL, fps: FPS, seek };

  let raf = 0;
  if (params.get("play") === "1") {
    let f = Number(params.get("f") ?? 0) || 0;
    void ready.then(() => {
      const loop = () => {
        seek(f);
        f = (f + 1) % TOTAL;
        raf = requestAnimationFrame(loop);
      };
      loop();
    });
  } else if (params.has("f")) {
    void ready.then(() => seek(Number(params.get("f"))));
  }
  return () => {
    cancelAnimationFrame(raf);
    root.remove();
    style.remove();
  };
}
