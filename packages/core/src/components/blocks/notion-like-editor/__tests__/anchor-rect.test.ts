import { describe, expect, test } from "bun:test";

import { createVirtualAnchor, elementRect, rangeRect } from "../components/ui/anchor-rect";

describe("live anchor rect", () => {
  test("rangeRect reads the range on every call", () => {
    const host = document.createElement("span");
    host.textContent = "Hello";
    document.body.appendChild(host);
    const range = document.createRange();
    range.selectNodeContents(host);
    let top = 12;
    range.getBoundingClientRect = () => new window.DOMRect(4, top, 20, 8);

    expect(rangeRect(range).top).toBe(12);
    expect(rangeRect(range).left).toBe(4);
    expect(rangeRect(range).width).toBe(20);
    top = 48;
    expect(rangeRect(range).top).toBe(48);
    expect(rangeRect(null).width).toBe(0);
    host.remove();
  });

  test("elementRect and the virtual anchor stay live", () => {
    const host = document.createElement("span");
    document.body.appendChild(host);
    let left = 2;
    host.getBoundingClientRect = () => new window.DOMRect(left, 5, 11, 7);

    expect(elementRect(host).left).toBe(2);
    expect(elementRect(null).height).toBe(0);
    left = 30;

    const anchor = createVirtualAnchor(
      () => elementRect(host),
      () => host,
    );
    expect(anchor.getBoundingClientRect().left).toBe(30);
    expect(anchor.contextElement).toBe(host);
    left = 80;
    expect(anchor.getBoundingClientRect().left).toBe(80);
    host.remove();
  });
});
