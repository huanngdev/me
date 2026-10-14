import type { CorePackageJson, FileSystem, ItemDefinition } from "../lib/build.ts";

export const FAKE_ROOT = "/fake/repo";
export const FAKE_SRC = `${FAKE_ROOT}/packages/core/src`;

/** In-memory filesystem keyed by absolute path. */
export function fakeFs(files: Record<string, string>): FileSystem {
  return {
    isFile: (absolutePath: string): boolean => Object.hasOwn(files, absolutePath),
    read: (absolutePath: string): string => {
      const text = files[absolutePath];
      if (text === undefined) {
        throw new Error(`fake fs: missing ${absolutePath}`);
      }
      return text;
    },
  };
}

export const FAKE_PACKAGE: CorePackageJson = {
  dependencies: { "lucide-react": "^1.56.0", "@platejs/list": "53.3.13", platejs: "53.3.15" },
  devDependencies: { "@platejs/math": "53.3.12" },
};

export function srcPath(relative: string): string {
  return `${FAKE_SRC}/${relative}`;
}

/** Item whose source prefix is `components/<name>` unless overridden. */
export function item(
  name: string,
  entries: string[],
  extra: Partial<ItemDefinition> = {},
): ItemDefinition {
  const prefix = `components/${name}`;
  return {
    name,
    type: "registry:component",
    title: name,
    description: `${name} description`,
    entries: entries.map((entry) => `packages/core/src/${entry}`),
    sourcePrefix: prefix,
    targetRoot: prefix,
    ...extra,
  };
}
