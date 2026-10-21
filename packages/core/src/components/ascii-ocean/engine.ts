// Ported from https://github.com/stackedlol/ascii-sharks (used with the author's permission).
import { createPaletteReader } from "./palette";
import { AsciiRenderer, type OceanPalette } from "./renderer";
import type { RosterEntry } from "./creatures/roster";
import type { OceanColors, OceanInteraction, OceanScene } from "./creatures/types";
import { World } from "./world";

const STEP = 1 / 60;
const MAX_STEPS = 4;
/** A press is a click only if the pointer moved less than this many px, within this many ms. */
const CLICK_PX = 6;
const CLICK_MS = 500;
/** Presses on these are for the page (links, buttons, inputs), not for the ocean. */
const INTERACTIVE = "a, button, input, textarea, select, label, [role=button], [contenteditable]";

/** Constructor options for OceanEngine: the world's setup plus the pointer behaviour. */
export type EngineOptions = {
  roster?: RosterEntry[];
  seed?: number;
  scene?: OceanScene;
  baitFish?: number | "auto" | false;
  /** "feed" drops food on a click; "splash" flashes the water on press; "none" ignores presses. Hover avoidance is always on. */
  interaction?: OceanInteraction;
  /** Animal colouring: real colours ("natural") or greyscale that inverts on light pages ("theme"). Default "theme". */
  colors?: OceanColors;
  /** Sea surface (swell, sun glitter, wind streaks) and wakes (natural colours only). Turn off for a calmer background. Default true. */
  surface?: boolean;
};

/**
 * Wires World + AsciiRenderer to a canvas: variable-substep loop, resize,
 * pointer input, pausing off-screen, and prefers-reduced-motion.
 */
export class OceanEngine {
  private world: World;
  private renderer: AsciiRenderer;
  private raf = 0;
  private last = 0;
  private visible = true;
  private reducedMotion: MediaQueryList;
  private colorScheme: MediaQueryList;
  private themeObserver: MutationObserver;
  private resizeObserver: ResizeObserver;
  private intersectionObserver: IntersectionObserver;
  private disposed = false;
  private readPalette: (el: HTMLElement) => OceanPalette;
  private canvas: HTMLCanvasElement;
  private interaction: OceanInteraction;
  /** Where the current feed press started, or null. */
  private press: { x: number; y: number; t: number } | null = null;

  constructor(canvas: HTMLCanvasElement, options: EngineOptions) {
    this.canvas = canvas;
    this.readPalette = createPaletteReader();
    this.interaction = options.interaction ?? "splash";
    this.world = new World({
      roster: options.roster,
      seed: options.seed,
      scene: options.scene,
      baitFish: options.baitFish,
    });
    this.renderer = new AsciiRenderer(canvas);
    this.renderer.setColors(options.colors ?? "theme");
    this.renderer.setSurface(options.surface ?? true);
    this.renderer.setScene(options.scene ?? "ocean", options.seed ?? 0);
    this.renderer.setFontFamily(getComputedStyle(canvas).fontFamily);
    this.renderer.setPalette(this.readPalette(this.canvas));
    this.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    this.colorScheme = window.matchMedia("(prefers-color-scheme: dark)");
    this.colorScheme.addEventListener("change", this.onThemeChange);
    this.themeObserver = new MutationObserver(this.onThemeChange);
    this.themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style", "data-theme"],
    });

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.intersectionObserver = new IntersectionObserver(([entry]) => {
      this.visible = entry.isIntersecting;
      this.schedule();
    });
    this.intersectionObserver.observe(canvas);

    this.reducedMotion.addEventListener("change", this.onMotionPreference);
    window.addEventListener("pointermove", this.onPointerMove, { passive: true });
    window.addEventListener("pointerdown", this.onPointerDown, { passive: true });
    window.addEventListener("pointerup", this.onPointerUp, { passive: true });
    window.addEventListener("pointercancel", this.onPointerCancel, { passive: true });
    document.documentElement.addEventListener("pointerleave", this.onPointerLeave);
    window.addEventListener("blur", this.onPointerLeave);

    this.resize();
    // Canvas text can't trigger a webfont load; once the mono face is in, redraw.
    document.fonts?.load(`600 16px ${getComputedStyle(canvas).fontFamily}`).then(() => {
      if (!this.disposed && this.reducedMotion.matches) this.drawStill();
    });
    this.schedule();
  }

  destroy() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObserver.disconnect();
    this.intersectionObserver.disconnect();
    this.themeObserver.disconnect();
    this.colorScheme.removeEventListener("change", this.onThemeChange);
    this.reducedMotion.removeEventListener("change", this.onMotionPreference);
    window.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("pointerdown", this.onPointerDown);
    window.removeEventListener("pointerup", this.onPointerUp);
    window.removeEventListener("pointercancel", this.onPointerCancel);
    document.documentElement.removeEventListener("pointerleave", this.onPointerLeave);
    window.removeEventListener("blur", this.onPointerLeave);
  }

  /** Starts a random jumper's jump (see World.playRandomJump). Reduced motion has no shows, so it returns 0. */
  playRandomJump(): number {
    if (this.reducedMotion.matches) return 0;
    return this.world.playRandomJump();
  }

  hasJumpers(): boolean {
    return this.world.hasJumpers();
  }

  private resize() {
    // Layout size, not getBoundingClientRect(): a CSS transform on an ancestor
    // (e.g. a scaled preview) must not shrink the world.
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    if (width < 1 || height < 1) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.resize(width, height, dpr);
    this.world.resize(width, height, this.renderer.cellWidth, this.renderer.cellHeight);
    if (this.reducedMotion.matches) this.drawStill();
  }

  private schedule() {
    cancelAnimationFrame(this.raf);
    if (this.disposed || !this.visible || this.reducedMotion.matches) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  private frame = (now: number) => {
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    // Variable substeps: n equal steps that add up to this frame's dt, so motion does not judder at 120 or 144 Hz.
    // A non-positive dt (a timestamp from before the last schedule) steps nothing; the world divides by dt.
    if (dt > 0) {
      const n = Math.min(MAX_STEPS, Math.max(1, Math.ceil(dt / STEP)));
      for (let i = 0; i < n; i++) this.world.step(dt / n);
    }
    this.renderer.render(this.world, Math.max(0, dt));
    this.raf = requestAnimationFrame(this.frame);
  };

  /** Reduced motion: let the ecosystem settle, then show a single frame. */
  private drawStill() {
    if (this.world.time < 4) {
      for (let i = 0; i < 240; i++) this.world.step(STEP);
    }
    this.renderer.render(this.world, STEP);
  }

  private onMotionPreference = () => {
    if (this.reducedMotion.matches) {
      cancelAnimationFrame(this.raf);
      this.drawStill();
    } else {
      this.schedule();
    }
  };

  /** Light/dark switch or accent change: re-read the page colours and repaint. */
  private onThemeChange = () => {
    this.renderer.setPalette(this.readPalette(this.canvas));
    if (this.reducedMotion.matches) this.drawStill();
  };

  private toLocal(e: PointerEvent) {
    const rect = this.canvas.getBoundingClientRect();
    // Map screen pixels back to layout pixels when an ancestor is transformed.
    const sx = rect.width > 0 ? this.canvas.clientWidth / rect.width : 1;
    const sy = rect.height > 0 ? this.canvas.clientHeight / rect.height : 1;
    const x = (e.clientX - rect.left) * sx;
    const y = (e.clientY - rect.top) * sy;
    const inside =
      x >= 0 && y >= 0 && x <= this.canvas.clientWidth && y <= this.canvas.clientHeight;
    return { x, y, inside };
  }

  private onPointerMove = (e: PointerEvent) => {
    const { x, y, inside } = this.toLocal(e);
    const p = this.world.pointer;
    p.x = x;
    p.y = y;
    p.active = inside && e.pointerType !== "touch";
  };

  private onPointerDown = (e: PointerEvent) => {
    if (this.interaction === "none") return;
    const { x, y, inside } = this.toLocal(e);
    if (this.interaction === "feed") {
      // Only a primary-button press (or a touch or pen tap) can feed.
      if (e.button !== 0) {
        this.press = null;
        return;
      }
      const onControl = (e.target as Element | null)?.closest?.(INTERACTIVE);
      this.press = inside && !onControl ? { x, y, t: performance.now() } : null;
      return;
    }
    if (inside && !this.reducedMotion.matches) this.world.splash(x, y);
  };

  /** A scroll or other gesture took the pointer over, so the press is not a click. */
  private onPointerCancel = () => {
    this.press = null;
  };

  /** Feed mode: a press and release close together, in place, is a click that drops food. */
  private onPointerUp = (e: PointerEvent) => {
    const press = this.press;
    this.press = null;
    if (!press || this.interaction !== "feed" || this.reducedMotion.matches) return;
    const { x, y, inside } = this.toLocal(e);
    const moved = Math.hypot(x - press.x, y - press.y);
    if (!inside || moved > CLICK_PX || performance.now() - press.t > CLICK_MS) return;
    this.world.offerFood(press.x, press.y);
  };

  private onPointerLeave = () => {
    this.world.pointer.active = false;
  };
}
