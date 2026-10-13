import { describe, expect, test } from "bun:test";

import { parseOffFeatures } from "../demo/demo-feature-flags";

describe("parseOffFeatures", () => {
  test("no off parameter turns nothing off", () => {
    expect(parseOffFeatures("")).toEqual({});
    expect(parseOffFeatures("?readonly=1")).toEqual({});
  });

  test("each named feature is set to false, and nothing else", () => {
    expect(parseOffFeatures("?off=tables,media")).toEqual({ tables: false, media: false });
    expect(parseOffFeatures("?off=blockHandle")).toEqual({ blockHandle: false });
  });

  test("unknown names and blanks are ignored", () => {
    expect(parseOffFeatures("?off=tables,nope, media ,,")).toEqual({
      tables: false,
      media: false,
    });
    expect(parseOffFeatures("?off=")).toEqual({});
    expect(parseOffFeatures("?off=toString")).toEqual({});
  });
});
