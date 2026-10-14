import { describe, expect, test } from "bun:test";

import {
  aliasOf,
  fileRole,
  helperTarget,
  ownedTarget,
  ownsPath,
  virtualPath,
} from "../lib/targets.ts";
import { applyEdits } from "../lib/imports.ts";

const dirItem = {
  name: "audio-player",
  sourcePrefix: "components/audio-player",
  targetRoot: "components/audio-player",
};
const flatItem = {
  name: "tile-treemap",
  sourcePrefix: "components/tile-treemap",
  targetRoot: "components/tile-treemap",
};
const movedItem = {
  name: "error-page",
  sourcePrefix: "components/blocks/error-page-block",
  targetRoot: "components/blocks/error-page",
};

describe("ownership and owned targets", () => {
  test("a directory item keeps its layout", () => {
    expect(ownsPath(dirItem, "components/audio-player/audio-player.tsx")).toBe(true);
    expect(ownedTarget(dirItem, "components/audio-player/audio-player.tsx")).toBe(
      "@components/audio-player/audio-player.tsx",
    );
  });

  test("a flat item's files move into the item's own folder", () => {
    expect(ownsPath(flatItem, "components/tile-treemap.utils.ts")).toBe(true);
    expect(ownedTarget(flatItem, "components/tile-treemap.tsx")).toBe(
      "@components/tile-treemap/tile-treemap.tsx",
    );
    expect(ownedTarget(flatItem, "components/tile-treemap.utils.ts")).toBe(
      "@components/tile-treemap/tile-treemap.utils.ts",
    );
  });

  test("a moved item lands in its target root", () => {
    expect(ownedTarget(movedItem, "components/blocks/error-page-block.tsx")).toBe(
      "@components/blocks/error-page/error-page-block.tsx",
    );
  });

  test("ownership does not leak to siblings that share a prefix", () => {
    expect(ownsPath(flatItem, "components/tile-treemap-extra.tsx")).toBe(false);
    expect(ownsPath(dirItem, "components/audio-player-old/x.tsx")).toBe(false);
    expect(ownsPath(dirItem, "components/shared.tsx")).toBe(false);
  });

  test("shared helpers install under the item namespace with their prefix kept", () => {
    expect(helperTarget("notion-like-editor", "lib/click-soft.ts")).toBe(
      "@components/huanngdev/notion-like-editor/lib/click-soft.ts",
    );
    expect(helperTarget("crm-data-table", "components/safari.tsx")).toBe(
      "@components/huanngdev/crm-data-table/components/safari.tsx",
    );
  });

  test("alias form of a target is what the CLI maps to the user's alias", () => {
    expect(aliasOf("@components/huanngdev/crm-data-table/components/safari.tsx")).toBe(
      "@/components/huanngdev/crm-data-table/components/safari",
    );
    expect(aliasOf("@lib/z.ts")).toBe("@/lib/z");
    expect(aliasOf("@components/blocks/x/index.tsx")).toBe("@/components/blocks/x");
  });
});

describe("type mapping", () => {
  test("components .tsx is a component", () => {
    expect(fileRole("components/audio-player/audio-player.tsx")).toEqual({
      type: "registry:component",
      target: "@components/audio-player/audio-player.tsx",
    });
  });

  test("components .ts and lib .ts are lib files", () => {
    expect(fileRole("components/video-player/use-video-player.ts").type).toBe("registry:lib");
    expect(fileRole("lib/sound-types.ts").type).toBe("registry:lib");
  });

  test("hooks are registry:hook", () => {
    expect(fileRole("hooks/use-mobile.ts").type).toBe("registry:hook");
  });

  test("unsupported locations and extensions fail loudly", () => {
    expect(() => fileRole("app/page.tsx")).toThrow("only components/, hooks/ and lib/ are shipped");
    expect(() => fileRole("lib/x.tsx")).toThrow("unsupported file type");
    expect(() => fileRole("components/x.css")).toThrow("unsupported file type");
  });

  test("virtual path is stable and scoped to the item", () => {
    expect(virtualPath("notion-like-editor", "components/elements/x.tsx")).toBe(
      "registry/default/notion-like-editor/components/elements/x.tsx",
    );
  });
});

describe("specifier rewriting", () => {
  test("changes only the rewritten specifier and leaves every other byte alone", () => {
    const source = [
      "// header   with   spaces",
      'import { Button } from "@/components/button";',
      "",
      "const   x=1;\t// tab",
      'export { y } from "./y";',
      "",
    ].join("\n");
    const start = source.indexOf("@/components/button");
    const rewritten = applyEdits(source, [
      { start, end: start + "@/components/button".length, replacement: "@/components/ui/button" },
    ]);
    expect(rewritten).toBe(source.replace("@/components/button", "@/components/ui/button"));
  });

  test("rejects overlapping edits", () => {
    expect(() =>
      applyEdits("abcdef", [
        { start: 0, end: 3, replacement: "x" },
        { start: 2, end: 4, replacement: "y" },
      ]),
    ).toThrow("overlapping edits");
  });
});
