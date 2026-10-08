import { afterEach, describe, expect, test } from "bun:test";

import { switchThemeWithReveal } from "./theme-transition";

type TransitionStub = {
  skipTransition: () => void;
  finished: Promise<void>;
  ready: Promise<void>;
  updateCallbackDone: Promise<void>;
  skipped: boolean;
  resolveFinished: () => void;
};

type AnimateCall = {
  clipPath: string[];
  pseudoElement: string | undefined;
};

const originalDocument = globalThis.document;
const originalWindow = globalThis.window;

function installEnvironment(options: {
  startViewTransition?: (callback: () => void | Promise<void>) => TransitionStub;
  reducedMotion?: boolean;
  innerWidth?: number;
  innerHeight?: number;
  onAnimate?: (call: AnimateCall) => void;
}) {
  const attributes = new Map<string, string>();
  const root = {
    className: "light",
    setAttribute(name: string, value: string) {
      attributes.set(name, value);
    },
    getAttribute(name: string) {
      return attributes.get(name) ?? null;
    },
    removeAttribute(name: string) {
      attributes.delete(name);
    },
    animate(keyframes: PropertyIndexedKeyframes, animationOptions?: KeyframeAnimationOptions) {
      const clipPath = keyframes.clipPath;
      const paths = Array.isArray(clipPath)
        ? clipPath.filter((value): value is string => typeof value === "string")
        : [];
      options.onAnimate?.({
        clipPath: paths,
        pseudoElement:
          animationOptions && typeof animationOptions !== "number"
            ? (animationOptions.pseudoElement ?? undefined)
            : undefined,
      });
    },
  };

  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      documentElement: root,
      startViewTransition: options.startViewTransition,
    },
  });

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      innerWidth: options.innerWidth ?? 800,
      innerHeight: options.innerHeight ?? 600,
      matchMedia(query: string) {
        return {
          matches: options.reducedMotion === true && query === "(prefers-reduced-motion: reduce)",
          media: query,
        };
      },
    },
  });

  return root;
}

function createTransition(): TransitionStub {
  let resolveFinished: () => void = () => {};
  const finished = new Promise<void>((resolve) => {
    resolveFinished = resolve;
  });

  return {
    skipped: false,
    finished,
    ready: Promise.resolve(),
    updateCallbackDone: Promise.resolve(),
    resolveFinished,
    skipTransition() {
      this.skipped = true;
    },
  };
}

afterEach(() => {
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: originalDocument,
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: originalWindow,
  });
});

describe("switchThemeWithReveal", () => {
  test("calls apply synchronously when view transitions are unavailable", () => {
    installEnvironment({});
    let applied = false;

    switchThemeWithReveal(() => {
      applied = true;
    });

    expect(applied).toBe(true);
  });

  test("calls apply directly when reduced motion is preferred", () => {
    let started = false;
    installEnvironment({
      reducedMotion: true,
      startViewTransition: () => {
        started = true;
        return createTransition();
      },
    });
    let applied = false;

    switchThemeWithReveal(() => {
      applied = true;
    });

    expect(applied).toBe(true);
    expect(started).toBe(false);
  });

  test("sets the reveal attribute and removes it after the transition finishes", async () => {
    const transition = createTransition();
    const root = installEnvironment({
      startViewTransition: (callback) => {
        callback();
        return transition;
      },
    });
    let applied = false;

    switchThemeWithReveal(() => {
      applied = true;
      root.className = "dark";
    });

    expect(applied).toBe(true);
    expect(root.getAttribute("data-theme-transition")).toBe("reveal");

    transition.resolveFinished();
    await transition.finished;

    expect(root.getAttribute("data-theme-transition")).toBeNull();
  });

  test("skips the running transition before starting another", async () => {
    const transitions: TransitionStub[] = [];
    const root = installEnvironment({
      startViewTransition: (callback) => {
        callback();
        const transition = createTransition();
        transitions.push(transition);
        return transition;
      },
    });

    switchThemeWithReveal(() => {
      root.className = "dark";
    });
    switchThemeWithReveal(() => {
      root.className = "light";
    });

    const first = transitions[0];
    const second = transitions[1];
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    if (!first || !second) return;

    expect(first.skipped).toBe(true);
    expect(second.skipped).toBe(false);
    expect(root.getAttribute("data-theme-transition")).toBe("reveal");

    first.resolveFinished();
    await first.finished;
    expect(root.getAttribute("data-theme-transition")).toBe("reveal");

    second.resolveFinished();
    await second.finished;
    expect(root.getAttribute("data-theme-transition")).toBeNull();
  });

  test("reveals from the origin with a circle that covers the far corner", async () => {
    const calls: AnimateCall[] = [];
    const origin = { x: 100, y: 50 };
    const width = 800;
    const height = 600;
    installEnvironment({
      innerWidth: width,
      innerHeight: height,
      onAnimate: (call) => {
        calls.push(call);
      },
      startViewTransition: (callback) => {
        callback();
        return createTransition();
      },
    });

    switchThemeWithReveal(() => {}, origin);
    await Promise.resolve();

    const call = calls[0];
    expect(call).toBeDefined();
    if (!call) return;

    const radius = Math.hypot(
      Math.max(origin.x, width - origin.x),
      Math.max(origin.y, height - origin.y),
    );
    expect(call.pseudoElement).toBe("::view-transition-new(root)");
    expect(call.clipPath).toEqual([
      `circle(0px at ${origin.x}px ${origin.y}px)`,
      `circle(${radius}px at ${origin.x}px ${origin.y}px)`,
    ]);
    expect(radius).toBeGreaterThanOrEqual(Math.hypot(width - origin.x, height - origin.y));
    expect(radius).toBeGreaterThanOrEqual(Math.hypot(origin.x, height - origin.y));
    expect(radius).toBeGreaterThanOrEqual(Math.hypot(width - origin.x, origin.y));
    expect(radius).toBeGreaterThanOrEqual(Math.hypot(origin.x, origin.y));
  });
});
