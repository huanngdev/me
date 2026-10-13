import { Window } from "happy-dom";

// One window for every test. Replacing these globals with another Window makes
// Radix dispatch an Event from a different realm.
const dom = new Window();

const installed: Record<string, unknown> = {
  window: dom,
  document: dom.document,
  Node: dom.Node,
  Element: dom.Element,
  HTMLElement: dom.HTMLElement,
  HTMLInputElement: dom.HTMLInputElement,
  HTMLButtonElement: dom.HTMLButtonElement,
  HTMLIFrameElement: dom.HTMLIFrameElement,
  HTMLFormElement: dom.HTMLFormElement,
  Event: dom.Event,
  CustomEvent: dom.CustomEvent,
  FocusEvent: dom.FocusEvent,
  MouseEvent: dom.MouseEvent,
  PointerEvent: dom.PointerEvent,
  KeyboardEvent: dom.KeyboardEvent,
  DOMParser: dom.DOMParser,
  DataTransfer: dom.DataTransfer,
  NodeFilter: dom.NodeFilter,
  navigator: dom.navigator,
  DocumentFragment: dom.DocumentFragment,
  Document: dom.Document,
  ShadowRoot: dom.ShadowRoot,
  MutationObserver: dom.MutationObserver,
  getComputedStyle: dom.getComputedStyle.bind(dom),
  requestAnimationFrame: dom.requestAnimationFrame.bind(dom),
  cancelAnimationFrame: dom.cancelAnimationFrame.bind(dom),
};

for (const [key, value] of Object.entries(installed)) {
  Reflect.set(globalThis, key, value);
}

// Radix and the media player observe their size and visibility. Nothing here lays out or scrolls, so the
// observers never report. A real implementation already present is kept.
class InertObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): [] {
    return [];
  }
}
if (!("ResizeObserver" in globalThis)) {
  Reflect.set(globalThis, "ResizeObserver", InertObserver);
}
if (!("IntersectionObserver" in globalThis)) {
  Reflect.set(globalThis, "IntersectionObserver", InertObserver);
}

export const testWindow: Window = dom;

export function parseHtml(html: string): unknown {
  return new dom.DOMParser().parseFromString(html, "text/html").body;
}
