/**
 * Where each packaged file lands in a user project.
 *
 * Every item owns exactly one directory (its `targetRoot`). Its own files go there:
 *   - items with a source directory keep the layout (`components/audio-player/x.tsx`);
 *   - single-file items move into their own folder (`components/tile-treemap.tsx` ->
 *     `components/tile-treemap/tile-treemap.tsx`).
 * Any other repo file a packaged file needs is a shared helper. It is installed per item under
 * `@components/huanngdev/<item>/<path under packages/core/src>`, so it can never collide with
 * the user's own files or with another item's copy.
 */

export type RegistryFileType = "registry:component" | "registry:lib" | "registry:hook";

export type FileRole = {
  type: RegistryFileType;
  target: string;
};

/** Minimal item shape needed for ownership. */
export type OwnedItem = {
  name: string;
  /** Source prefix (repo-relative under packages/core/src): a directory or a file stem. */
  sourcePrefix: string;
  /** Target root (under packages/core/src layout): the directory the item installs into. */
  targetRoot: string;
};

const ROOTS = [
  { prefix: "components/", alias: "@components/" },
  { prefix: "hooks/", alias: "@hooks/" },
  { prefix: "lib/", alias: "@lib/" },
] as const;

/** `components/x.tsx` -> `@components/x.tsx`. Throws for unsupported roots. */
export function srcToTarget(relativePath: string): string {
  const root = ROOTS.find((candidate) => relativePath.startsWith(candidate.prefix));
  if (root === undefined) {
    throw new Error(
      `cannot package ${relativePath}: only components/, hooks/ and lib/ are shipped`,
    );
  }
  return `${root.alias}${relativePath.slice(root.prefix.length)}`;
}

/** Registry type of a source file. */
export function fileRole(relativePath: string): FileRole {
  const target = srcToTarget(relativePath);
  if (relativePath.startsWith("hooks/") && /\.tsx?$/.test(relativePath)) {
    return { type: "registry:hook", target };
  }
  if (relativePath.endsWith(".tsx") && relativePath.startsWith("components/")) {
    return { type: "registry:component", target };
  }
  if (
    relativePath.endsWith(".ts") &&
    (relativePath.startsWith("components/") || relativePath.startsWith("lib/"))
  ) {
    return { type: "registry:lib", target };
  }
  throw new Error(`unsupported file type for ${relativePath}`);
}

/** True when a repo file (under packages/core/src) is one of the item's own files. */
export function ownsPath(item: OwnedItem, relativePath: string): boolean {
  const prefix = item.sourcePrefix;
  return (
    relativePath === prefix ||
    relativePath.startsWith(`${prefix}/`) ||
    relativePath.startsWith(`${prefix}.`)
  );
}

/** Target of one of the item's own files. */
export function ownedTarget(item: OwnedItem, relativePath: string): string {
  const prefix = item.sourcePrefix;
  const suffix = relativePath.startsWith(`${prefix}/`)
    ? relativePath.slice(prefix.length)
    : `/${relativePath.slice(relativePath.lastIndexOf("/") + 1)}`;
  return srcToTarget(`${item.targetRoot}${suffix}`);
}

/** Target of a shared helper, copied into `item`'s namespace. */
export function helperTarget(itemName: string, relativePath: string): string {
  return `@components/huanngdev/${itemName}/${relativePath}`;
}

/**
 * Alias form of a target, which the CLI maps to the user's own alias:
 * `@components/x/y.tsx` -> `@/components/x/y`, `@lib/z.ts` -> `@/lib/z`.
 */
export function aliasOf(target: string): string {
  const match = /^@(components|hooks|lib)\/(.+)$/.exec(target);
  if (match === null || match[1] === undefined || match[2] === undefined) {
    throw new Error(`not an install target: ${target}`);
  }
  let rest = match[2].replace(/\.tsx?$/, "");
  if (rest.endsWith("/index")) {
    rest = rest.slice(0, -"/index".length);
  }
  return `@/${match[1]}/${rest}`;
}

export function virtualPath(item: string, relativePath: string): string {
  return `registry/default/${item}/${relativePath}`;
}
