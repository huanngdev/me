import { describe, expect, test } from "bun:test";

import {
  classifySpecifier,
  packageNameOf,
  resolveWithCandidates,
  type ClassifyContext,
} from "../lib/classify.ts";
import { collectImports } from "../lib/imports.ts";
import { FAKE_PACKAGE, FAKE_SRC, fakeFs, srcPath } from "./helpers.ts";

const files = fakeFs(
  Object.fromEntries(
    [
      "components/audio-player/audio-player.tsx",
      "components/video-player/use-video-player.ts",
      "components/button.tsx",
      "components/copy-button.tsx",
      "components/layouts/block-url.tsx",
      "components/blocks/notion/index.tsx",
      "lib/utils.ts",
      "lib/sound-types.ts",
      "hooks/use-mobile.ts",
    ].map((relative): [string, string] => [srcPath(relative), ""]),
  ),
);

const context: ClassifyContext = {
  srcRoot: FAKE_SRC,
  resolveFile: (base) => resolveWithCandidates(base, files.isFile),
  primitives: new Set(["button", "tooltip"]),
  packageRanges: FAKE_PACKAGE.dependencies ?? {},
};

function classify(specifier: string, from: string) {
  return classifySpecifier({ specifier }, srcPath(from), from, context);
}

describe("import classification", () => {
  test("a relative import that does not resolve fails loudly", () => {
    expect(() => classify("./copy", "components/x.tsx")).toThrow("does not resolve to a file");
  });

  test("relative imports resolve to files, whichever item owns them", () => {
    expect(classify("./use-video-player", "components/video-player/video-player.tsx")).toEqual({
      kind: "file",
      absolutePath: srcPath("components/video-player/use-video-player.ts"),
    });
    expect(classify("../../../lib/sound-types", "components/blocks/notion/index.tsx")).toEqual({
      kind: "file",
      absolutePath: srcPath("lib/sound-types.ts"),
    });
  });

  test("@/lib/utils and a relative path to lib/utils both become the alias form", () => {
    expect(classify("@/lib/utils", "components/x.tsx")).toEqual({
      kind: "utils",
      specifier: "@/lib/utils",
    });
    expect(classify("../../lib/utils", "components/audio-player/audio-player.tsx")).toEqual({
      kind: "utils",
      specifier: "@/lib/utils",
    });
  });

  test("a stock primitive is a primitive, by alias or by relative path", () => {
    const expected = { kind: "primitive", name: "button", specifier: "@/components/ui/button" };
    expect(classify("@/components/button", "components/x.tsx")).toEqual(expected);
    expect(classify("../button", "components/audio-player/audio-player.tsx")).toEqual(expected);
  });

  test("a non-stock flat file is a file, not a primitive", () => {
    expect(classify("@/components/copy-button", "components/x.tsx")).toEqual({
      kind: "file",
      absolutePath: srcPath("components/copy-button.tsx"),
    });
  });

  test("own @/components, @/hooks and @/lib paths resolve to files", () => {
    expect(classify("@/components/layouts/block-url", "components/x.tsx")).toEqual({
      kind: "file",
      absolutePath: srcPath("components/layouts/block-url.tsx"),
    });
    expect(classify("@/hooks/use-mobile", "components/x.tsx")).toEqual({
      kind: "file",
      absolutePath: srcPath("hooks/use-mobile.ts"),
    });
    expect(classify("@/lib/sound-types", "components/x.tsx")).toEqual({
      kind: "file",
      absolutePath: srcPath("lib/sound-types.ts"),
    });
  });

  test("an @/components path that is neither a primitive nor a file fails loudly", () => {
    expect(() => classify("@/components/nope", "components/x.tsx")).toThrow(
      "is neither a shadcn primitive nor an existing file",
    );
  });

  test("a @repo/* self import fails loudly", () => {
    expect(() => classify("@repo/core/components/x", "components/x.tsx")).toThrow(
      "imports this workspace by package name",
    );
  });

  test("bare packages: scoped names and sub-paths reduce to the package name", () => {
    expect(packageNameOf("@vidstack/react/player/styles/base.css")).toBe("@vidstack/react");
    expect(packageNameOf("highlight.js/lib/languages/typescript")).toBe("highlight.js");
    expect(packageNameOf("@platejs/list/react")).toBe("@platejs/list");
    expect(packageNameOf("platejs/react")).toBe("platejs");
    expect(classify("@platejs/list/react", "components/x.tsx")).toEqual({
      kind: "package",
      name: "@platejs/list",
      range: "53.3.13",
    });
  });

  test("react, react-dom and next are not installed; node built-ins are ignored", () => {
    expect(classify("react", "components/x.tsx")).toEqual({
      kind: "ignored",
      name: "react",
      reason: "peer",
    });
    expect(classify("react-dom/client", "components/x.tsx")).toEqual({
      kind: "ignored",
      name: "react-dom",
      reason: "peer",
    });
    expect(classify("next/link", "components/x.tsx")).toEqual({
      kind: "ignored",
      name: "next",
      reason: "next",
    });
    expect(classify("node:fs", "components/x.tsx")).toEqual({
      kind: "ignored",
      name: "node:fs",
      reason: "builtin",
    });
  });

  test("a package that is not declared fails loudly", () => {
    expect(() => classify("left-pad", "components/x.tsx")).toThrow(
      "not declared in packages/core/package.json",
    );
  });

  test("a relative import of a local CSS file fails loudly", () => {
    const cssFs = fakeFs({ [srcPath("components/x.css")]: "" });
    const ctx: ClassifyContext = {
      ...context,
      resolveFile: (base) => resolveWithCandidates(base, cssFs.isFile),
    };
    expect(() =>
      classifySpecifier(
        { specifier: "./x.css" },
        srcPath("components/y.tsx"),
        "components/y.tsx",
        ctx,
      ),
    ).toThrow("imports a local CSS file");
  });
});

describe("import extraction", () => {
  test("collects static, export-from, dynamic, side-effect and type-only imports", () => {
    const source = [
      'import { a } from "@/components/button";',
      'import type { T } from "./types";',
      'export { b } from "./b";',
      'export * from "@platejs/list/react";',
      'import "katex/dist/katex.min.css";',
      'const lazy = import("./lazy");',
    ].join("\n");
    const refs = collectImports("components/x.tsx", source);
    expect(refs.map((ref) => [ref.specifier, ref.kind, ref.typeOnly])).toEqual([
      ["@/components/button", "import", false],
      ["./types", "import", true],
      ["./b", "export", false],
      ["@platejs/list/react", "export", false],
      ["katex/dist/katex.min.css", "side-effect", false],
      ["./lazy", "dynamic", false],
    ]);
  });

  test("a non-literal dynamic import is rejected", () => {
    expect(() => collectImports("components/x.tsx", "const m = import(name);")).toThrow(
      "dynamic import() needs a literal specifier",
    );
  });
});
