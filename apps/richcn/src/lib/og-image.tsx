import { ImageResponse } from "next/og";

import { OG_IMAGE_COLORS, OG_IMAGE_SIZE } from "./og";
import { SITE } from "./site";

/**
 * One renderer for every social card, so the home card and the doc cards cannot drift apart. It is
 * plain JSX on Satori: flex everywhere, no CSS files, and the font `next/og` ships with. Nothing
 * here fetches anything at build time.
 */

const { background, text, muted, accent } = OG_IMAGE_COLORS;

const EYEBROW = {
  fontFamily: "sans-serif",
  fontSize: 30,
  letterSpacing: 2,
  textTransform: "uppercase",
  color: muted,
} as const;

const FOOTER = {
  fontFamily: "sans-serif",
  fontSize: 28,
  color: muted,
} as const;

export type SocialCardOptions = {
  /** The small line above the title, for example `richcn` or `richcn docs`. */
  eyebrow: string;
  /** The one large line. A long title wraps, because the box is fixed. */
  title: string;
};

export function socialCard({ eyebrow, title }: SocialCardOptions): ImageResponse {
  return new ImageResponse(
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        width: "100%",
        height: "100%",
        padding: "80px 88px",
        backgroundColor: background,
        color: text,
      }}
    >
      <div style={{ display: "flex", ...EYEBROW }}>{eyebrow}</div>
      <div
        style={{
          display: "flex",
          maxWidth: 960,
          fontSize: title.length > 60 ? 68 : 82,
          lineHeight: 1.15,
          letterSpacing: -1,
        }}
      >
        {title}
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div
          style={{
            display: "flex",
            width: 128,
            height: 6,
            borderRadius: 3,
            marginBottom: 28,
            backgroundColor: accent,
          }}
        />
        <div style={{ display: "flex", ...FOOTER }}>{SITE.url.replace(/^https?:\/\//, "")}</div>
      </div>
    </div>,
    { ...OG_IMAGE_SIZE },
  );
}
