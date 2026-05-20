"use client";

import { useEffect, useState } from "react";

const RAMP = "@%#*+=-:. ";

interface AsciiImageProps {
  src: string;
  alt?: string;
  cols?: number; // số cột ký tự, default 80
  fontSize?: number; // px, default 7
  color?: boolean; // giữ màu gốc, default false
  className?: string;
}

type AsciiLine = { char: string; color: string }[];

function render(img: HTMLImageElement, cols: number, color: boolean): AsciiLine[] {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  const rows = Math.round(cols * (img.naturalHeight / img.naturalWidth) * 0.55);
  canvas.width = cols;
  canvas.height = rows;
  ctx.drawImage(img, 0, 0, cols, rows);
  const { data } = ctx.getImageData(0, 0, cols, rows);

  return Array.from({ length: rows }, (_, y) =>
    Array.from({ length: cols }, (_, x) => {
      const i = (y * cols + x) * 4;
      const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const char = RAMP[Math.floor((1 - lum / 255) * (RAMP.length - 1))];
      return { char, color: color ? `rgb(${r},${g},${b})` : "currentColor" };
    }),
  );
}

export default function AsciiImage({
  src,
  alt,
  cols = 80,
  fontSize = 7,
  color = false,
  className,
}: AsciiImageProps) {
  const [lines, setLines] = useState<AsciiLine[]>([]);

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => setLines(render(img, cols, color));
    img.src = src;
  }, [src, cols, color]);

  if (!lines.length) return null;

  return (
    <pre
      role="img"
      aria-label={alt}
      style={{ fontSize, lineHeight: 1, margin: 0 }}
      className={className}
    >
      {lines.map((line, i) => (
        <div key={i}>
          {line.map((c, j) => (
            <span key={j} style={color ? { color: c.color } : undefined}>
              {c.char}
            </span>
          ))}
        </div>
      ))}
    </pre>
  );
}
