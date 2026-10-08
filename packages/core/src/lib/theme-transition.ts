import { flushSync } from "react-dom";

const THEME_TRANSITION_ATTRIBUTE = "data-theme-transition";
const THEME_TRANSITION_VALUE = "reveal";
const REVEAL_DURATION_MS = 450;
const REVEAL_EASING = "cubic-bezier(0.2, 0, 0, 1)";

type ThemeRevealOrigin = {
  x: number;
  y: number;
};

let activeTransition: ViewTransition | null = null;

function ignoreSkipError(error: unknown): void {
  if (
    error instanceof DOMException &&
    (error.name === "AbortError" || error.name === "InvalidStateError")
  ) {
    return;
  }

  reportError(error);
}

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function skipActiveTransition(): void {
  const running = activeTransition;
  if (!running) return;

  try {
    running.skipTransition();
  } catch (error: unknown) {
    ignoreSkipError(error);
  }
}

function revealRadius(x: number, y: number): number {
  return Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
}

function revealOrigin(origin: ThemeRevealOrigin | undefined): ThemeRevealOrigin {
  return origin ?? { x: window.innerWidth / 2, y: window.innerHeight / 2 };
}

function startReveal(origin: ThemeRevealOrigin): void {
  const radius = revealRadius(origin.x, origin.y);
  document.documentElement.animate(
    {
      clipPath: [
        `circle(0px at ${origin.x}px ${origin.y}px)`,
        `circle(${radius}px at ${origin.x}px ${origin.y}px)`,
      ],
    },
    {
      duration: REVEAL_DURATION_MS,
      easing: REVEAL_EASING,
      pseudoElement: "::view-transition-new(root)",
    },
  );
}

export function switchThemeWithReveal(apply: () => void, origin?: ThemeRevealOrigin): void {
  if (typeof document === "undefined" || typeof window === "undefined") {
    apply();
    return;
  }

  if (typeof document.startViewTransition !== "function" || prefersReducedMotion()) {
    apply();
    return;
  }

  const root = document.documentElement;
  const revealFrom = revealOrigin(origin);
  skipActiveTransition();
  root.setAttribute(THEME_TRANSITION_ATTRIBUTE, THEME_TRANSITION_VALUE);

  // next-themes applies the html class from an effect. flushSync runs that
  // effect before returning, which is what the snapshot needs.
  const transition = document.startViewTransition(() => {
    flushSync(apply);
  });
  activeTransition = transition;

  const finished = transition.finished.finally(() => {
    if (activeTransition !== transition) return;
    activeTransition = null;
    root.removeAttribute(THEME_TRANSITION_ATTRIBUTE);
  });

  transition.ready.then(() => {
    startReveal(revealFrom);
  }, ignoreSkipError);
  transition.updateCallbackDone.catch(ignoreSkipError);
  finished.catch(ignoreSkipError);
}
