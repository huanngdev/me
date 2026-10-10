// A virtual popover anchor. Radix calls getBoundingClientRect on each position
// update, including while [data-block-viewport] or the page scrolls.
// contextElement is how Floating UI finds those scroll parents. The anchor
// element itself renders nothing.

export type VirtualAnchor = {
  getBoundingClientRect: () => DOMRect;
  readonly contextElement?: Element;
};

function createRect(x: number, y: number, width: number, height: number): DOMRect {
  const view = globalThis.document?.defaultView;
  if (view) {
    return new view.DOMRect(x, y, width, height);
  }

  return new DOMRect(x, y, width, height);
}

function copyRect(rect: DOMRectReadOnly): DOMRect {
  return createRect(rect.x, rect.y, rect.width, rect.height);
}

function emptyRect(): DOMRect {
  return createRect(0, 0, 0, 0);
}

function isZero(rect: DOMRectReadOnly): boolean {
  return rect.x === 0 && rect.y === 0 && rect.width === 0 && rect.height === 0;
}

export function rangeRect(range: Range | null | undefined): DOMRect {
  if (!range) {
    return emptyRect();
  }

  const rect = range.getBoundingClientRect();
  if (isZero(rect)) {
    const first = range.getClientRects()[0];
    if (first) {
      return copyRect(first);
    }
  }

  return copyRect(rect);
}

export function elementRect(element: Element | null | undefined): DOMRect {
  if (!element) {
    return emptyRect();
  }

  return copyRect(element.getBoundingClientRect());
}

export function rangeContextElement(range: Range | null | undefined): Element | null {
  if (!range) {
    return null;
  }

  const node = range.startContainer;
  if (node instanceof Element) {
    return node;
  }

  return node.parentElement;
}

export function anchorContext(element: Element | null | undefined): Element | null {
  if (element) {
    return element;
  }

  if (typeof document === "undefined") {
    return null;
  }

  return document.querySelector("[data-block-viewport]");
}

export function createVirtualAnchor(
  readRect: () => DOMRect,
  readContext: () => Element | null,
): VirtualAnchor {
  return {
    getBoundingClientRect: () => readRect(),
    get contextElement() {
      return readContext() ?? undefined;
    },
  };
}

export function virtualAnchor(
  readRect: () => DOMRect,
  readContext: () => Element | null,
): { current: VirtualAnchor } {
  return { current: createVirtualAnchor(readRect, readContext) };
}
