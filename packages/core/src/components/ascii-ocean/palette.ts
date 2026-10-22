import { DEFAULT_PALETTE, type OceanPalette } from "./renderer";

/**
 * Returns a reader that takes the page colours from an element's `background-color` and `color`.
 * It keeps one probe canvas, created on first use, to resolve any CSS colour (including oklch()).
 */
export function createPaletteReader(): (el: HTMLElement) => OceanPalette {
  let probe: CanvasRenderingContext2D | null = null;

  /** Resolves any CSS colour (including oklch()) to rgba bytes via a reusable 1×1 canvas. */
  const toRgba = (css: string): Uint8ClampedArray | null => {
    if (!probe) {
      const canvas = document.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
      probe = canvas.getContext("2d", { willReadFrequently: true });
    }
    const ctx = probe;
    if (!ctx) return null;
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "#000";
    ctx.fillStyle = css;
    ctx.fillRect(0, 0, 1, 1);
    return ctx.getImageData(0, 0, 1, 1).data;
  };

  return (el: HTMLElement): OceanPalette => {
    const style = getComputedStyle(el);
    const bg = toRgba(style.backgroundColor);
    const fg = toRgba(style.color);
    // No background colour (transparent): keep the default look.
    if (!bg || !fg || bg[3] === 0) return DEFAULT_PALETTE;
    const luminance = (0.2126 * bg[0] + 0.7152 * bg[1] + 0.0722 * bg[2]) / 255;
    return {
      background: [bg[0], bg[1], bg[2]],
      foreground: [fg[0], fg[1], fg[2]],
      mode: luminance > 0.5 ? "light" : "dark",
    };
  };
}
