import { clamp, hash3 } from "./math";

/** 0 spray, 1 bubble, 2 blow mist. */
export type ParticleKind = 0 | 1 | 2;

const KIND_SPRAY: ParticleKind = 0;
const KIND_BUBBLE: ParticleKind = 1;
const KIND_MIST: ParticleKind = 2;

/** Spray decelerates as v *= exp(-SPRAY_DRAG * dt). */
const SPRAY_DRAG = 3;
/** Blow mist slows more gently, so the cloud keeps spreading for its whole life. */
const MIST_DRAG = 1;
const MIST_LIFE = 2.4;
/** The plume leans downwind: a constant drift of (0.35, −0.12) plume radii per second, not slowed by drag. */
const MIST_WIND_X = 0.35;
const MIST_WIND_Y = -0.12;
const BUBBLE_SPEED = 4;

/**
 * Render-side particles and surface rings. Struct-of-arrays in fixed pools: a full pool
 * overwrites its oldest slot, and nothing is allocated after construction.
 * Effects knows nothing about canvas; the renderer draws what forEach* visits.
 *
 * Randomness comes only from hash3 on the caller's seed, so the same events give the same effects.
 */
export class Effects {
  private readonly maxParticles: number;
  private readonly maxRings: number;

  private px: Float32Array;
  private py: Float32Array;
  private pvx: Float32Array;
  private pvy: Float32Array;
  /** Constant drift per particle (mist only), not damped by drag. */
  private pwx: Float32Array;
  private pwy: Float32Array;
  private page: Float32Array;
  private plife: Float32Array;
  private pkind: Uint8Array;
  private palive: Uint8Array;
  private pnext = 0;

  private rx: Float32Array;
  private ry: Float32Array;
  private rr: Float32Array;
  private rspeed: Float32Array;
  private rmax: Float32Array;
  private rstrength: Float32Array;
  /** Seconds left before a ring starts to grow; it is alive but not drawn until this reaches 0. */
  private rdelay: Float32Array;
  private ralive: Uint8Array;
  /** Per ring: a seed fixed at spawn (its shape), and the seconds since it spawned. */
  private rseed: Float32Array;
  private rage: Float32Array;
  private rnext = 0;
  private rcount = 0;

  constructor(maxParticles = 400, maxRings = 64) {
    this.maxParticles = maxParticles;
    this.maxRings = maxRings;
    this.px = new Float32Array(maxParticles);
    this.py = new Float32Array(maxParticles);
    this.pvx = new Float32Array(maxParticles);
    this.pvy = new Float32Array(maxParticles);
    this.pwx = new Float32Array(maxParticles);
    this.pwy = new Float32Array(maxParticles);
    this.page = new Float32Array(maxParticles);
    this.plife = new Float32Array(maxParticles);
    this.pkind = new Uint8Array(maxParticles);
    this.palive = new Uint8Array(maxParticles);
    this.rx = new Float32Array(maxRings);
    this.ry = new Float32Array(maxRings);
    this.rr = new Float32Array(maxRings);
    this.rspeed = new Float32Array(maxRings);
    this.rmax = new Float32Array(maxRings);
    this.rstrength = new Float32Array(maxRings);
    this.rdelay = new Float32Array(maxRings);
    this.ralive = new Uint8Array(maxRings);
    this.rseed = new Float32Array(maxRings);
    this.rage = new Float32Array(maxRings);
  }

  /**
   * Expanding ring on the surface: radius grows at `speed` px/s until `maxR`, fading.
   * With `delay` > 0 the ring waits that many seconds, invisible, before it starts to grow.
   */
  ring(x: number, y: number, speed: number, maxR: number, strength: number, delay = 0) {
    const i = this.rnext;
    this.rnext = (i + 1) % this.maxRings;
    this.rx[i] = x;
    this.ry[i] = y;
    this.rr[i] = 0;
    this.rspeed[i] = speed;
    this.rmax[i] = maxR;
    this.rstrength[i] = strength;
    this.rdelay[i] = delay;
    this.ralive[i] = 1;
    this.rage[i] = 0;
    this.rseed[i] = hash3(this.rcount++, i, 90);
  }

  /** `n` spray droplets thrown outward from (x, y) up to `reach` px. */
  spray(x: number, y: number, n: number, reach: number, seed: number) {
    for (let k = 0; k < n; k++) {
      const angle = hash3(seed, k, 1) * Math.PI * 2;
      // Under exponential drag the droplet travels v0 / SPRAY_DRAG in total, so v0 sets the reach.
      const v0 = SPRAY_DRAG * reach * (0.4 + 0.6 * hash3(seed, k, 2));
      const i = this.claim(x, y, KIND_SPRAY, 0.6 + 0.4 * hash3(seed, k, 3));
      this.pvx[i] = Math.cos(angle) * v0;
      this.pvy[i] = Math.sin(angle) * v0;
    }
  }

  /** A bubble that rises: shrinks o → ° → . and fades over `life` s, drifting slightly. */
  bubble(x: number, y: number, life: number, seed: number) {
    const i = this.claim(x, y, KIND_BUBBLE, life);
    // Up at 2–4 px/s with a sideways wobble of up to 2 px/s, so the speed stays near BUBBLE_SPEED.
    this.pvx[i] = (hash3(seed, 0, 4) * 2 - 1) * (BUBBLE_SPEED / 2);
    this.pvy[i] = -(BUBBLE_SPEED / 2 + hash3(seed, 0, 5) * (BUBBLE_SPEED / 2));
  }

  /**
   * A blow: a soft cluster of mist, `radius` px across, that spreads, fades slowly and leans downwind. A bigger
   * radius (a bigger animal) gives more particles, from 8 up to 28.
   */
  blow(x: number, y: number, radius: number, seed: number) {
    const n = Math.round(clamp(radius / 6, 8, 28));
    for (let k = 0; k < n; k++) {
      const angle = hash3(seed, k, 6) * Math.PI * 2;
      const r0 = radius * Math.sqrt(hash3(seed, k, 7));
      const i = this.claim(
        x + Math.cos(angle) * r0,
        y + Math.sin(angle) * r0,
        KIND_MIST,
        MIST_LIFE,
      );
      // Radial speed that carries the cloud out to about `radius` under MIST_DRAG.
      const v0 = MIST_DRAG * radius * (0.5 + 0.5 * hash3(seed, k, 8));
      this.pvx[i] = Math.cos(angle) * v0;
      this.pvy[i] = Math.sin(angle) * v0;
      this.pwx[i] = MIST_WIND_X * radius;
      this.pwy[i] = MIST_WIND_Y * radius;
    }
  }

  step(dt: number) {
    const { palive, page, plife, px, py, pvx, pvy, pwx, pwy, pkind } = this;
    const spray = Math.exp(-SPRAY_DRAG * dt);
    const mist = Math.exp(-MIST_DRAG * dt);
    for (let i = 0; i < this.maxParticles; i++) {
      if (!palive[i]) continue;
      page[i] += dt;
      if (page[i] >= plife[i]) {
        palive[i] = 0;
        continue;
      }
      const kind = pkind[i];
      if (kind === KIND_SPRAY) {
        pvx[i] *= spray;
        pvy[i] *= spray;
      } else if (kind === KIND_MIST) {
        pvx[i] *= mist;
        pvy[i] *= mist;
      }
      px[i] += (pvx[i] + pwx[i]) * dt;
      py[i] += (pvy[i] + pwy[i]) * dt;
    }
    const { ralive, rr, rspeed, rmax, rdelay, rage } = this;
    for (let i = 0; i < this.maxRings; i++) {
      if (!ralive[i]) continue;
      rage[i] += dt;
      let t = dt;
      if (rdelay[i] > 0) {
        if (rdelay[i] >= t) {
          rdelay[i] -= t;
          continue;
        }
        // The wait ends partway through this step; the rest of the step is growth.
        t -= rdelay[i];
        rdelay[i] = 0;
      }
      rr[i] += rspeed[i] * t;
      if (rr[i] >= rmax[i]) ralive[i] = 0;
    }
  }

  /** Visit live particles and rings. The renderer draws them; Effects knows nothing about canvas. */
  forEachParticle(fn: (x: number, y: number, kind: ParticleKind, age01: number) => void) {
    for (let i = 0; i < this.maxParticles; i++) {
      if (!this.palive[i]) continue;
      fn(this.px[i], this.py[i], this.pkind[i] as ParticleKind, this.page[i] / this.plife[i]);
    }
  }

  /** Visits the rings that are growing. `seed` fixes the ring's shape; `age` is seconds since it spawned. */
  forEachRing(
    fn: (x: number, y: number, r: number, alpha: number, seed: number, age: number) => void,
  ) {
    for (let i = 0; i < this.maxRings; i++) {
      if (!this.ralive[i] || this.rdelay[i] > 0) continue;
      const fade = 1 - this.rr[i] / this.rmax[i];
      fn(this.rx[i], this.ry[i], this.rr[i], this.rstrength[i] * fade, this.rseed[i], this.rage[i]);
    }
  }

  /** Takes the next slot (the oldest once the pool is full) and starts a particle there. */
  private claim(x: number, y: number, kind: ParticleKind, life: number) {
    const i = this.pnext;
    this.pnext = (i + 1) % this.maxParticles;
    this.px[i] = x;
    this.py[i] = y;
    this.pvx[i] = 0;
    this.pvy[i] = 0;
    this.pwx[i] = 0;
    this.pwy[i] = 0;
    this.page[i] = 0;
    this.plife[i] = life;
    this.pkind[i] = kind;
    this.palive[i] = 1;
    return i;
  }
}
