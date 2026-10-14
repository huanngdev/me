import { builtinModules } from "node:module";
import { dirname, join, posix } from "node:path";

import type { ImportRef } from "./imports.ts";

/**
 * What one module specifier inside a packaged file points at. Ownership (which item
 * a file belongs to, and its install target) is decided by the build, not here.
 *
 * - `file`: a repo file under packages/core/src; the build decides its target.
 * - `primitive`: a stock shadcn primitive; becomes a bare registryDependency and the specifier is rewritten.
 * - `utils`: `@/lib/utils`, kept as the alias form (every shadcn project has it).
 * - `package`: an npm package (`name` is the package name, not the sub-path).
 * - `ignored`: react, react-dom and next are peers; Node built-ins need no install.
 */
export type Classification =
  | { kind: "file"; absolutePath: string }
  | { kind: "primitive"; name: string; specifier: string }
  | { kind: "utils"; specifier: string }
  | { kind: "package"; name: string; range: string }
  | { kind: "ignored"; name: string; reason: "peer" | "next" | "builtin" };

export type ClassifyContext = {
  /** Absolute path of `packages/core/src`. */
  srcRoot: string;
  /** Returns the real file for an extensionless or index-style path, or undefined. */
  resolveFile: (absoluteBase: string) => string | undefined;
  primitives: ReadonlySet<string>;
  /** Declared dependency ranges from packages/core/package.json. */
  packageRanges: Readonly<Record<string, string>>;
};

export const PEER_PACKAGES: ReadonlySet<string> = new Set(["react", "react-dom"]);

const BUILTINS: ReadonlySet<string> = new Set(builtinModules);

/** `@scope/name/sub` -> `@scope/name`, `name/sub` -> `name`. */
export function packageNameOf(specifier: string): string {
  const segments = specifier.split("/");
  if (specifier.startsWith("@")) {
    return segments.slice(0, 2).join("/");
  }
  return segments[0] ?? specifier;
}

function fail(from: string, specifier: string, reason: string): never {
  throw new Error(`${from}: "${specifier}" ${reason}`);
}

export function classifySpecifier(
  ref: Pick<ImportRef, "specifier">,
  fromAbsolute: string,
  fromRelative: string,
  context: ClassifyContext,
): Classification {
  const specifier = ref.specifier;

  if (specifier.startsWith("./") || specifier.startsWith("../")) {
    const resolved = context.resolveFile(join(dirname(fromAbsolute), specifier));
    if (resolved === undefined) {
      fail(fromRelative, specifier, "does not resolve to a file");
    }
    const relativeTarget = posix.relative(context.srcRoot, resolved);
    const primitive = primitiveForFlatComponent(
      stripSourceExtension(relativeTarget),
      context.primitives,
    );
    if (primitive !== undefined) {
      return { kind: "primitive", name: primitive, specifier: `@/components/ui/${primitive}` };
    }
    if (relativeTarget === "lib/utils.ts") {
      return { kind: "utils", specifier: "@/lib/utils" };
    }
    return classifyResolved(resolved, fromRelative, specifier);
  }

  if (specifier === "@/lib/utils") {
    return { kind: "utils", specifier };
  }

  if (specifier.startsWith("@/")) {
    const rest = specifier.slice(2);
    const primitive = primitiveForFlatComponent(rest, context.primitives);
    if (primitive !== undefined) {
      return { kind: "primitive", name: primitive, specifier: `@/components/ui/${primitive}` };
    }
    const resolved = context.resolveFile(join(context.srcRoot, rest));
    if (resolved === undefined) {
      fail(fromRelative, specifier, "is neither a shadcn primitive nor an existing file");
    }
    if (!/^(components|hooks|lib)\//.test(rest)) {
      fail(fromRelative, specifier, "must point into components/, hooks/ or lib/");
    }
    return classifyResolved(resolved, fromRelative, specifier);
  }

  if (specifier.startsWith("@repo/")) {
    fail(
      fromRelative,
      specifier,
      "imports this workspace by package name; use a relative or @/ path",
    );
  }

  if (specifier.startsWith("node:") || BUILTINS.has(specifier)) {
    return { kind: "ignored", name: specifier, reason: "builtin" };
  }

  if (specifier.startsWith(".")) {
    fail(fromRelative, specifier, "is not a supported relative path");
  }

  const name = packageNameOf(specifier);
  if (PEER_PACKAGES.has(name)) {
    return { kind: "ignored", name, reason: "peer" };
  }
  if (name === "next") {
    return { kind: "ignored", name, reason: "next" };
  }
  const range = context.packageRanges[name];
  if (range === undefined) {
    fail(
      fromRelative,
      specifier,
      `imports "${name}", which is not declared in packages/core/package.json`,
    );
  }
  return { kind: "package", name, range };
}

function classifyResolved(
  resolved: string,
  fromRelative: string,
  specifier: string,
): Classification {
  if (resolved.endsWith(".css")) {
    fail(fromRelative, specifier, "imports a local CSS file, which the registry cannot package");
  }
  return { kind: "file", absolutePath: resolved };
}

function stripSourceExtension(path: string): string {
  return path.replace(/\.tsx?$/, "");
}

/** `components/button` (no extension) names a flat stock primitive. */
function primitiveForFlatComponent(
  path: string,
  primitives: ReadonlySet<string>,
): string | undefined {
  const match = /^components\/([^/]+)$/.exec(path);
  const name = match?.[1];
  if (name === undefined || !primitives.has(name)) {
    return undefined;
  }
  return name;
}

/**
 * Resolves a base path to a file: exact file, `.ts`/`.tsx` extension, or `index.ts(x)`.
 * `.js` specifiers map to their TypeScript source.
 */
export function resolveWithCandidates(
  base: string,
  isFile: (path: string) => boolean,
): string | undefined {
  const mapped = base.replace(/\.js$/, "");
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    join(base, "index.ts"),
    join(base, "index.tsx"),
    `${mapped}.ts`,
    `${mapped}.tsx`,
  ];
  return candidates.find((candidate) => isFile(candidate));
}
