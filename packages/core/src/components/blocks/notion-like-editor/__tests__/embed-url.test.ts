import { describe, expect, test } from "bun:test";

import {
  EMBED_URL_MAX,
  embedFrameSrc,
  embedWatchUrl,
  isYouTubeShort,
  parseEmbedUrl,
} from "../lib/features/editor-embed-url";

const ID = "aqz-KE-bpKQ";

describe("embed url parser", () => {
  test.each([
    [`https://www.youtube.com/watch?v=${ID}`, { provider: "youtube", videoId: ID }],
    [`https://youtube.com/watch?v=${ID}`, { provider: "youtube", videoId: ID }],
    [`https://m.youtube.com/watch?v=${ID}`, { provider: "youtube", videoId: ID }],
    [`https://music.youtube.com/watch?v=${ID}`, { provider: "youtube", videoId: ID }],
    [`https://youtu.be/${ID}`, { provider: "youtube", videoId: ID }],
    [`https://youtu.be/${ID}?t=90`, { provider: "youtube", videoId: ID, startSeconds: 90 }],
    [
      `https://www.youtube.com/watch?v=${ID}&t=1m30s`,
      { provider: "youtube", videoId: ID, startSeconds: 90 },
    ],
    [
      `https://www.youtube.com/watch?v=${ID}&start=15`,
      { provider: "youtube", videoId: ID, startSeconds: 15 },
    ],
    [
      `https://www.youtube.com/watch?v=${ID}#t=2m`,
      { provider: "youtube", videoId: ID, startSeconds: 120 },
    ],
    [`https://www.youtube.com/shorts/${ID}`, { provider: "youtube", videoId: ID }],
    [`https://www.youtube.com/embed/${ID}`, { provider: "youtube", videoId: ID }],
    [`https://www.youtube.com/live/${ID}`, { provider: "youtube", videoId: ID }],
    [`https://www.youtube-nocookie.com/embed/${ID}`, { provider: "youtube", videoId: ID }],
    [`https://vimeo.com/76979871`, { provider: "vimeo", videoId: "76979871" }],
    [`https://www.vimeo.com/76979871`, { provider: "vimeo", videoId: "76979871" }],
    [
      `https://vimeo.com/76979871/ABCDEF1234`,
      { provider: "vimeo", videoId: "76979871", hash: "abcdef1234" },
    ],
    [
      `https://player.vimeo.com/video/76979871?h=abcdef1234`,
      { provider: "vimeo", videoId: "76979871", hash: "abcdef1234" },
    ],
  ])("reads %s", (input, expected) => {
    expect(parseEmbedUrl(input)).toMatchObject(expected);
  });

  test("the stored source is the https link without credentials or port", () => {
    expect(parseEmbedUrl(`  http://youtu.be/${ID}  `)?.sourceUrl).toBe(`https://youtu.be/${ID}`);
  });

  test.each([
    ["javascript", `javascript:alert(1)`],
    ["data", `data:text/html,<iframe src="https://www.youtube.com/embed/${ID}">`],
    ["ftp", `ftp://www.youtube.com/watch?v=${ID}`],
    ["another host", "https://example.com/"],
    ["a video site that is not allowed", "https://www.dailymotion.com/video/x7abc"],
    ["a look-alike host", `https://youtube.com.evil.com/watch?v=${ID}`],
    ["a host that ends in the name", `https://notyoutube.com/watch?v=${ID}`],
    ["a look-alike vimeo host", "https://vimeo.com.evil.com/76979871"],
    ["a user name", `https://user@www.youtube.com/watch?v=${ID}`],
    ["a password", `https://user:secret@www.youtube.com/watch?v=${ID}`],
    ["a port", `https://www.youtube.com:8443/watch?v=${ID}`],
    ["a ten character id", "https://youtu.be/aqz-KE-bpK"],
    ["a twelve character id", "https://youtu.be/aqz-KE-bpKQX"],
    ["an id with a space", "https://youtu.be/aqz KE-bpKQ"],
    ["a bad start time", `https://www.youtube.com/watch?v=${ID}&t=abc`],
    ["a vimeo id with letters", "https://vimeo.com/abc"],
    ["a vimeo hash that is not hex", "https://vimeo.com/76979871/zz"],
    ["a vimeo hash on the wrong host", "https://www.youtube.com/watch?v=76979871"],
    ["an empty string", ""],
    ["spaces only", "   "],
    ["a link over the length limit", `https://youtu.be/${ID}?x=${"a".repeat(EMBED_URL_MAX)}`],
  ])("rejects %s", (_label, input) => {
    expect(parseEmbedUrl(input)).toBeUndefined();
  });

  test("a YouTube Shorts link is detected from its path", () => {
    expect(isYouTubeShort(`https://www.youtube.com/shorts/${ID}`)).toBe(true);
    expect(isYouTubeShort(`https://www.youtube.com/watch?v=${ID}`)).toBe(false);
    expect(isYouTubeShort("not a url")).toBe(false);
  });
});

describe("embed frame source and watch link", () => {
  test("YouTube frames use the no-cookie host, with the start time", () => {
    expect(embedFrameSrc({ provider: "youtube", videoId: ID, startSeconds: 90 }, false)).toBe(
      `https://www.youtube-nocookie.com/embed/${ID}?start=90`,
    );
    expect(embedFrameSrc({ provider: "youtube", videoId: ID }, true)).toBe(
      `https://www.youtube-nocookie.com/embed/${ID}?autoplay=1`,
    );
  });

  test("Vimeo frames use the player host, with the hash and the start time as a fragment", () => {
    expect(
      embedFrameSrc(
        { provider: "vimeo", videoId: "76979871", hash: "abcdef1234", startSeconds: 90 },
        false,
      ),
    ).toBe("https://player.vimeo.com/video/76979871?h=abcdef1234#t=90s");
    expect(embedFrameSrc({ provider: "vimeo", videoId: "76979871" }, false)).toBe(
      "https://player.vimeo.com/video/76979871",
    );
  });

  test("the watch link is built from the provider and id only", () => {
    expect(embedWatchUrl("youtube", ID)).toBe(`https://www.youtube.com/watch?v=${ID}`);
    expect(embedWatchUrl("vimeo", "76979871")).toBe("https://vimeo.com/76979871");
  });
});
