import { describe, expect, test } from "bun:test";

import { buildRegistry, type BuildOptions } from "../lib/build.ts";
import { buildPortfolioRegistry, readPublicSiteUrl, ROOT } from "../build-registry.ts";
import { ITEMS } from "../items.ts";
import { SHADCN_PRIMITIVES } from "../primitives.ts";
import { FAKE_PACKAGE, FAKE_ROOT, fakeFs, item, srcPath } from "./helpers.ts";

const GLOBALS = `
:root { --editor-text-gray: oklch(0.5 0 0); --radius: 1rem; }
.dark { --editor-text-gray: oklch(0.9 0 0); }
@theme inline { --color-editor-text-gray: var(--editor-text-gray); }
.slate-editor [data-block-placeholder] { position: relative; }
`;

function options(files: Record<string, string>, items: BuildOptions["items"]): BuildOptions {
  return {
    repoRoot: FAKE_ROOT,
    baseUrl: "https://example.test",
    items,
    fs: fakeFs({ [`${FAKE_ROOT}/packages/core/src/styles/globals.css`]: GLOBALS, ...files }),
    primitives: SHADCN_PRIMITIVES,
    corePackage: FAKE_PACKAGE,
    globalsCssPath: `${FAKE_ROOT}/packages/core/src/styles/globals.css`,
    siteName: "huanngdev",
  };
}

function fileOf(
  json: { files: { target: string; content: string }[] } | undefined,
  target: string,
): string | undefined {
  return json?.files.find((file) => file.target === target)?.content;
}

describe("buildRegistry on fixtures", () => {
  test("a primitive is rewritten; the item's own sibling import stays relative", () => {
    const source = [
      'import { Button } from "@/components/button";',
      'import { cn } from "@/lib/utils";',
      'import { helper } from "./helper";',
      'import { X } from "lucide-react";',
      "export const   Thing = () => <Button className={cn(helper)}><X /></Button>;",
      "",
    ].join("\n");
    const result = buildRegistry(
      options(
        {
          [srcPath("components/thing/thing.tsx")]: source,
          [srcPath("components/thing/helper.ts")]: "export const helper = 1;\n",
        },
        [
          item("thing", ["components/thing/thing.tsx"], {
            sourcePrefix: "components/thing",
            targetRoot: "components/thing",
          }),
        ],
      ),
    );
    const json = result.items.get("thing");
    expect(json?.registryDependencies).toEqual(["button"]);
    expect(json?.dependencies).toEqual(["lucide-react@^1.56.0"]);
    expect(json?.files.map((file) => file.target)).toEqual([
      "@components/thing/helper.ts",
      "@components/thing/thing.tsx",
    ]);
    expect(fileOf(json, "@components/thing/thing.tsx")).toBe(
      source.replace('"@/components/button"', '"@/components/ui/button"'),
    );
  });

  test("a shared helper is installed under the item namespace and its imports are rewritten", () => {
    const result = buildRegistry(
      options(
        {
          [srcPath("components/a.tsx")]:
            'import { s } from "../lib/shared";\nexport const a = s;\n',
          [srcPath("lib/shared.ts")]: 'import { t } from "./tiny";\nexport const s = t;\n',
          [srcPath("lib/tiny.ts")]: "export const t = 1;\n",
        },
        [item("a", ["components/a.tsx"])],
      ),
    );
    const json = result.items.get("a");
    expect(json?.files.map((file) => file.target)).toEqual([
      "@components/a/a.tsx",
      "@components/huanngdev/a/lib/shared.ts",
      "@components/huanngdev/a/lib/tiny.ts",
    ]);
    expect(fileOf(json, "@components/a/a.tsx")).toContain(
      'from "@/components/huanngdev/a/lib/shared"',
    );
    expect(fileOf(json, "@components/huanngdev/a/lib/shared.ts")).toContain(
      'from "@/components/huanngdev/a/lib/tiny"',
    );
  });

  test("two items that need the same helper each install their own namespaced copy", () => {
    const result = buildRegistry(
      options(
        {
          [srcPath("components/a/a.tsx")]:
            'import { s } from "@/lib/shared";\nexport const a = s;\n',
          [srcPath("components/b/b.tsx")]:
            'import { s } from "@/lib/shared";\nexport const b = s;\n',
          [srcPath("lib/shared.ts")]: "export const s = 1;\n",
        },
        [
          item("a", ["components/a/a.tsx"], {
            sourcePrefix: "components/a",
            targetRoot: "components/a",
          }),
          item("b", ["components/b/b.tsx"], {
            sourcePrefix: "components/b",
            targetRoot: "components/b",
          }),
        ],
      ),
    );
    expect(result.items.get("a")?.files.map((file) => file.target)).toContain(
      "@components/huanngdev/a/lib/shared.ts",
    );
    expect(result.items.get("b")?.files.map((file) => file.target)).toContain(
      "@components/huanngdev/b/lib/shared.ts",
    );
  });

  test("relative imports between two of the item's own files are kept as written", () => {
    const result = buildRegistry(
      options(
        {
          [srcPath("components/x/a.tsx")]: 'import { b } from "./b";\nexport const a = b;\n',
          [srcPath("components/x/b.ts")]: "export const b = 1;\n",
        },
        [
          item("x", ["components/x/a.tsx"], {
            sourcePrefix: "components/x",
            targetRoot: "components/x",
          }),
        ],
      ),
    );
    expect(fileOf(result.items.get("x"), "@components/x/a.tsx")).toContain('from "./b"');
  });

  test("a flat item's own files move into their folder and keep working relative imports", () => {
    const result = buildRegistry(
      options(
        {
          [srcPath("components/tile.tsx")]:
            'import { u } from "./tile.utils";\nexport const t = u;\n',
          [srcPath("components/tile.utils.ts")]: "export const u = 1;\n",
        },
        [item("tile", ["components/tile.tsx"])],
      ),
    );
    const json = result.items.get("tile");
    expect(json?.files.map((file) => file.target)).toEqual([
      "@components/tile/tile.tsx",
      "@components/tile/tile.utils.ts",
    ]);
    expect(fileOf(json, "@components/tile/tile.tsx")).toContain('from "./tile.utils"');
  });

  test("an import of another item's file depends on that item and uses its alias", () => {
    const result = buildRegistry(
      options(
        {
          [srcPath("components/a/a.tsx")]:
            'import { b } from "@/components/b/b";\nexport const a = b;\n',
          [srcPath("components/b/b.tsx")]: "export const b = 1;\n",
        },
        [
          item("a", ["components/a/a.tsx"], {
            sourcePrefix: "components/a",
            targetRoot: "components/a",
          }),
          item("b", ["components/b/b.tsx"], {
            sourcePrefix: "components/b",
            targetRoot: "components/b",
          }),
        ],
      ),
    );
    const a = result.items.get("a");
    expect(a?.registryDependencies).toEqual(["https://example.test/r/b.json"]);
    expect(a?.files.map((file) => file.target)).toEqual(["@components/a/a.tsx"]);
    expect(fileOf(a, "@components/a/a.tsx")).toContain('from "@/components/b/b"');
  });

  test("an item that reaches a sibling's entry through a relative path also depends on it", () => {
    const result = buildRegistry(
      options(
        {
          [srcPath("components/a/a.tsx")]: 'import { b } from "../b/b";\nexport const a = b;\n',
          [srcPath("components/b/b.tsx")]: "export const b = 1;\n",
        },
        [
          item("a", ["components/a/a.tsx"], {
            sourcePrefix: "components/a",
            targetRoot: "components/a",
          }),
          item("b", ["components/b/b.tsx"], {
            sourcePrefix: "components/b",
            targetRoot: "components/b",
          }),
        ],
      ),
    );
    expect(fileOf(result.items.get("a"), "@components/a/a.tsx")).toContain(
      'from "@/components/b/b"',
    );
  });

  test("css and cssVars come from the selected globals rules and manual extras", () => {
    const result = buildRegistry(
      options({ [srcPath("components/x/x.tsx")]: "export const x = 1;\n" }, [
        item("x", ["components/x/x.tsx"], {
          sourcePrefix: "components/x",
          targetRoot: "components/x",
          styles: { selectors: [".slate-editor"], variables: ["--editor-", "--color-editor-"] },
          css: { '@import "pkg/base.css"': {} },
          docs: "Add the import.",
        }),
      ]),
    );
    const json = result.items.get("x");
    expect(json?.css).toEqual({
      '@import "pkg/base.css"': {},
      ".slate-editor [data-block-placeholder]": { position: "relative" },
    });
    expect(json?.cssVars).toEqual({
      theme: { "--color-editor-text-gray": "var(--editor-text-gray)" },
      light: { "--editor-text-gray": "oklch(0.5 0 0)" },
      dark: { "--editor-text-gray": "oklch(0.9 0 0)" },
    });
    expect(json?.docs).toBe("Add the import.");
  });

  test("an unresolved relative import fails with the file and specifier", () => {
    expect(() =>
      buildRegistry(
        options({ [srcPath("components/x/x.tsx")]: 'import "./missing";\n' }, [
          item("x", ["components/x/x.tsx"], {
            sourcePrefix: "components/x",
            targetRoot: "components/x",
          }),
        ]),
      ),
    ).toThrow('components/x/x.tsx: "./missing" does not resolve to a file');
  });

  test("an entry outside its item's source prefix fails loudly", () => {
    expect(() =>
      buildRegistry(
        options({ [srcPath("components/y.tsx")]: "export const y = 1;\n" }, [
          item("x", ["components/y.tsx"]),
        ]),
      ),
    ).toThrow("is not under its sourcePrefix");
  });

  test("a reached excluded file fails loudly", () => {
    expect(() =>
      buildRegistry(
        options(
          {
            [srcPath("components/a/a.tsx")]: 'import { t } from "./demo/t";\n',
            [srcPath("components/a/demo/t.ts")]: "export const t = 1;\n",
          },
          [
            item("a", ["components/a/a.tsx"], {
              sourcePrefix: "components/a",
              targetRoot: "components/a",
              exclude: ["demo/**"],
            }),
          ],
        ),
      ),
    ).toThrow("components/a/demo/t.ts is excluded but is reached by an import");
  });

  test("a registryDependency cycle fails loudly", () => {
    expect(() =>
      buildRegistry(
        options(
          {
            [srcPath("components/a/a.tsx")]:
              'import { b } from "@/components/b/b";\nexport const a = b;\n',
            [srcPath("components/b/b.tsx")]:
              'import { a } from "@/components/a/a";\nexport const b = a;\n',
          },
          [
            item("a", ["components/a/a.tsx"], {
              sourcePrefix: "components/a",
              targetRoot: "components/a",
            }),
            item("b", ["components/b/b.tsx"], {
              sourcePrefix: "components/b",
              targetRoot: "components/b",
            }),
          ],
        ),
      ),
    ).toThrow("registryDependency cycle");
  });

  test("two items whose own files would install to the same target fail loudly", () => {
    expect(() =>
      buildRegistry(
        options(
          {
            [srcPath("components/p/x.tsx")]: "export const p = 1;\n",
            [srcPath("components/q/x.tsx")]: "export const q = 1;\n",
          },
          [
            item("p", ["components/p/x.tsx"], {
              sourcePrefix: "components/p",
              targetRoot: "components/shared",
            }),
            item("q", ["components/q/x.tsx"], {
              sourcePrefix: "components/q",
              targetRoot: "components/shared",
            }),
          ],
        ),
      ),
    ).toThrow("target @components/shared/x.tsx is written by both p and q");
  });

  test("an item that imports next/* must declare meta.framework next", () => {
    const source = 'import Link from "next/link";\nexport const L = Link;\n';
    expect(() =>
      buildRegistry(
        options({ [srcPath("components/n/n.tsx")]: source }, [
          item("n", ["components/n/n.tsx"], {
            sourcePrefix: "components/n",
            targetRoot: "components/n",
          }),
        ]),
      ),
    ).toThrow("does not set meta.framework");
    const result = buildRegistry(
      options({ [srcPath("components/n/n.tsx")]: source }, [
        item("n", ["components/n/n.tsx"], {
          sourcePrefix: "components/n",
          targetRoot: "components/n",
          meta: { framework: "next" },
        }),
      ]),
    );
    expect(result.items.get("n")?.meta).toEqual({ framework: "next" });
  });
});

describe("Radix-only items", () => {
  const files = {
    [srcPath("components/r/r.tsx")]:
      'import { Button } from "@/components/button";\nexport const R = Button;\n',
    [srcPath("components/p/p.tsx")]:
      'import { Button } from "@/components/button";\nexport const P = Button;\n',
  };
  test("an item listed as Radix-only with bare shadcn components is marked and noted", () => {
    const result = buildRegistry({
      ...options(files, [
        item("r", ["components/r/r.tsx"], {
          sourcePrefix: "components/r",
          targetRoot: "components/r",
        }),
      ]),
      radixOnlyItems: ["r"],
      radixNote: "Requires Radix.",
    });
    const json = result.items.get("r");
    expect(json?.meta).toEqual({ primitives: "radix" });
    expect(json?.docs).toBe("Requires Radix.");
  });
  test("an item not listed, or with no bare components, is not marked", () => {
    const result = buildRegistry({
      ...options(files, [
        item("p", ["components/p/p.tsx"], {
          sourcePrefix: "components/p",
          targetRoot: "components/p",
        }),
      ]),
      radixOnlyItems: ["r"],
      radixNote: "Requires Radix.",
    });
    expect(result.items.get("p")?.meta).toBeUndefined();
    expect(result.items.get("p")?.docs).toBeUndefined();
  });
});

describe("portfolio registry", () => {
  const baseUrl = readPublicSiteUrl(ROOT);
  const first = buildPortfolioRegistry({ baseUrl });
  const second = buildPortfolioRegistry({ baseUrl });

  test("two builds produce identical bytes", () => {
    expect([...second.outputs.entries()]).toEqual([...first.outputs.entries()]);
  });

  test("every item validates structurally", () => {
    const names = new Set(first.items.keys());
    const targetOwner = new Map<string, string>();
    const primitives = new Set(SHADCN_PRIMITIVES);
    for (const [name, json] of first.items) {
      expect(json.$schema).toBe("https://ui.shadcn.com/schema/registry-item.json");
      expect(json.name).toBe(name);
      expect(["registry:component", "registry:block"]).toContain(json.type);
      expect(json.files.length).toBeGreaterThan(0);

      for (const dependency of json.registryDependencies) {
        if (dependency.startsWith("http")) {
          const otherName = dependency
            .slice(dependency.lastIndexOf("/") + 1)
            .replace(/\.json$/, "");
          expect(names.has(otherName)).toBe(true);
          expect(dependency).toBe(`${baseUrl}/r/${otherName}.json`);
        } else {
          expect(primitives.has(dependency)).toBe(true);
        }
      }

      const definition = ITEMS.find((candidate) => candidate.name === name);
      const ownRoot = `@components/${definition?.targetRoot.replace(/^components\//, "")}/`;
      for (const file of json.files) {
        const other = targetOwner.get(file.target);
        expect(other).toBeUndefined();
        targetOwner.set(file.target, name);
        const inOwnRoot = file.target.startsWith(ownRoot);
        const inHelperNamespace = file.target.startsWith(`@components/huanngdev/${name}/`);
        expect(inOwnRoot || inHelperNamespace).toBe(true);
        expect(
          file.target.startsWith("@components/") ||
            file.target.startsWith("@hooks/") ||
            file.target.startsWith("@lib/"),
        ).toBe(true);
        for (const primitive of primitives) {
          expect(file.content.includes(`"@/components/${primitive}"`)).toBe(false);
          expect(file.content.includes(`'@/components/${primitive}'`)).toBe(false);
        }
        expect(/__tests__|\/demo\/|\.test\.|README/.test(file.target)).toBe(false);
      }
    }
  });
});
