import { join, posix, resolve } from "node:path";

import { matchesAnyGlob } from "./glob.ts";
import { applyEdits, collectImports, type ImportRef, type TextEdit } from "./imports.ts";
import {
  classifySpecifier,
  resolveWithCandidates,
  type Classification,
  type ClassifyContext,
} from "./classify.ts";
import {
  aliasOf,
  fileRole,
  helperTarget,
  ownedTarget,
  ownsPath,
  virtualPath,
  type RegistryFileType,
} from "./targets.ts";
import { extractStyles, type StyleBundle, type StyleSelection } from "./css.ts";

export type FileSystem = {
  isFile: (absolutePath: string) => boolean;
  read: (absolutePath: string) => string;
};

export type ItemDefinition = {
  name: string;
  type: "registry:component" | "registry:block";
  title: string;
  description: string;
  /** Public entry points, repo-relative (`packages/core/src/...`). */
  entries: readonly string[];
  /** Source prefix this item owns: a directory (`components/audio-player`) or a file stem (`components/tile-treemap`). */
  sourcePrefix: string;
  /** Install directory (under packages/core/src layout) for the item's own files. */
  targetRoot: string;
  /** Globs (matched at any depth under packages/core/src). Reaching one is a build error. */
  exclude?: readonly string[];
  /** Framework the item needs. `next` items use next/* imports and are reported as n/a elsewhere. */
  meta?: { framework?: "next"; primitives?: "radix" };
  docs?: string;
  /** Extra registry `css` rules (for example vidstack base CSS the docs page asks users to import). */
  css?: Record<string, unknown>;
  /** Extra registry `cssVars`. */
  cssVars?: RegistryCssVars;
  /** Rules copied from globals.css that the item's classes depend on. */
  styles?: StyleSelection;
};

export type RegistryCssVars = Partial<Record<"theme" | "light" | "dark", Record<string, string>>>;

export type CorePackageJson = {
  dependencies?: Readonly<Record<string, string>>;
  devDependencies?: Readonly<Record<string, string>>;
};

export type BuildOptions = {
  repoRoot: string;
  /** Public site URL, without a trailing slash. */
  baseUrl: string;
  items: readonly ItemDefinition[];
  fs: FileSystem;
  primitives: readonly string[];
  corePackage: CorePackageJson;
  /** Path to globals.css, used for `styles` selections. */
  globalsCssPath: string;
  /** Items that need Radix-based primitives. Marked `meta.primitives: "radix"` when they use bare shadcn components. */
  radixOnlyItems?: readonly string[];
  /** Note appended to `docs` for Radix-only items. */
  radixNote?: string;
  siteName: string;
};

export type RegistryItemFile = {
  path: string;
  type: RegistryFileType;
  target: string;
  content: string;
};

export type RegistryItemJson = {
  $schema: string;
  name: string;
  type: string;
  title: string;
  description: string;
  dependencies: string[];
  registryDependencies: string[];
  files: RegistryItemFile[];
  meta?: { framework?: "next"; primitives?: "radix" };
  css?: Record<string, unknown>;
  cssVars?: RegistryCssVars;
  docs?: string;
};

export type BuildResult = {
  /** File name (under `public/r/`) to exact text, including the trailing newline. */
  outputs: Map<string, string>;
  items: Map<string, RegistryItemJson>;
  /** Packages imported by shipped source but declared only in devDependencies. */
  devOnlyPackages: Map<string, string[]>;
  /** Every `next/*` import in packaged files, keyed by item. */
  nextImports: Map<string, string[]>;
};

export const ITEM_SCHEMA = "https://ui.shadcn.com/schema/registry-item.json";
export const REGISTRY_SCHEMA = "https://ui.shadcn.com/schema/registry.json";

type Ref = {
  ref: ImportRef;
  classification: Classification;
};

type PackagedFile = {
  relative: string;
  source: string;
  refs: Ref[];
};

type Crawled = {
  item: ItemDefinition;
  files: Map<string, PackagedFile>;
  packages: Map<string, string>;
  primitives: Set<string>;
  foreign: Set<string>;
  nextImports: string[];
};

export function srcRootOf(repoRoot: string): string {
  return join(repoRoot, "packages/core/src");
}

export function buildRegistry(options: BuildOptions): BuildResult {
  const srcRoot = srcRootOf(options.repoRoot);
  const primitives = new Set(options.primitives);
  const names = new Set<string>();
  for (const item of options.items) {
    if (names.has(item.name)) {
      throw new Error(`duplicate item name ${item.name}`);
    }
    names.add(item.name);
  }
  const ownerOf = (relative: string): ItemDefinition | undefined =>
    options.items.find((item) => ownsPath(item, relative));

  for (const item of options.items) {
    for (const entry of item.entries) {
      const relative = posix.relative(srcRoot, resolve(options.repoRoot, entry));
      if (relative.startsWith("..")) {
        throw new Error(`${item.name}: entry ${entry} is outside packages/core/src`);
      }
      if (ownerOf(relative)?.name !== item.name) {
        throw new Error(
          `${item.name}: entry ${entry} is not under its sourcePrefix ${item.sourcePrefix}`,
        );
      }
    }
  }

  const crawls = options.items.map((item) =>
    crawlItem(item, options, srcRoot, primitives, ownerOf),
  );
  assertNoForeignCycles(crawls);

  // Targets: owned files come from their owner; helpers are namespaced per packaging item.
  const targetOf = (crawl: Crawled, relative: string): string => {
    const owner = ownerOf(relative);
    if (owner !== undefined) {
      return ownedTarget(owner, relative);
    }
    return helperTarget(crawl.item.name, relative);
  };

  const items = new Map<string, RegistryItemJson>();
  const devOnlyPackages = new Map<string, string[]>();
  const nextImports = new Map<string, string[]>();
  const seenTargets = new Map<string, string>();
  for (const crawl of crawls) {
    const json = toItemJson(crawl, options, ownerOf, targetOf);
    for (const file of json.files) {
      const other = seenTargets.get(file.target);
      if (other !== undefined && other !== crawl.item.name) {
        throw new Error(`target ${file.target} is written by both ${other} and ${crawl.item.name}`);
      }
      seenTargets.set(file.target, crawl.item.name);
    }
    items.set(crawl.item.name, json);
    const devOnly = [...crawl.packages.keys()].filter(
      (name) => options.corePackage.dependencies?.[name] === undefined,
    );
    if (devOnly.length > 0) {
      devOnlyPackages.set(crawl.item.name, devOnly.sort());
    }
    if (crawl.nextImports.length > 0) {
      nextImports.set(crawl.item.name, crawl.nextImports);
      if (crawl.item.meta?.framework !== "next") {
        throw new Error(
          `${crawl.item.name} imports next/* but does not set meta.framework to "next"`,
        );
      }
    }
  }

  const outputs = new Map<string, string>();
  for (const [name, json] of items) {
    outputs.set(`${name}.json`, stringifyJson(json));
  }
  outputs.set("registry.json", stringifyJson(toRegistryIndex(options, items)));
  return { outputs, items, devOnlyPackages, nextImports };
}

function crawlItem(
  item: ItemDefinition,
  options: BuildOptions,
  srcRoot: string,
  primitives: ReadonlySet<string>,
  ownerOf: (relative: string) => ItemDefinition | undefined,
): Crawled {
  const crawled: Crawled = {
    item,
    files: new Map(),
    packages: new Map(),
    primitives: new Set(),
    foreign: new Set(),
    nextImports: [],
  };
  const packageRanges: Record<string, string> = {
    ...(options.corePackage.devDependencies ?? {}),
    ...(options.corePackage.dependencies ?? {}),
  };
  const context: ClassifyContext = {
    srcRoot,
    resolveFile: (base) => resolveWithCandidates(base, options.fs.isFile),
    primitives,
    packageRanges,
  };

  const queue: string[] = item.entries.map((entry) => resolve(options.repoRoot, entry));
  for (const entry of queue) {
    if (!options.fs.isFile(entry)) {
      throw new Error(
        `${item.name}: entry ${posix.relative(options.repoRoot, entry)} does not exist`,
      );
    }
  }
  while (queue.length > 0) {
    const absolute = queue.shift();
    if (absolute === undefined || crawled.files.has(absolute)) {
      continue;
    }
    const relative = posix.relative(srcRoot, absolute);
    const owner = ownerOf(relative);
    if (owner !== undefined && owner.name !== item.name) {
      // Another item installs its own file. Depend on it instead of copying it.
      crawled.foreign.add(owner.name);
      continue;
    }
    if (item.exclude !== undefined && matchesAnyGlob(relative, item.exclude)) {
      throw new Error(`${item.name}: ${relative} is excluded but is reached by an import`);
    }
    const source = options.fs.read(absolute);
    const packaged: PackagedFile = { relative, source, refs: [] };
    crawled.files.set(absolute, packaged);

    for (const ref of collectImports(relative, source)) {
      const classification = classifySpecifier(ref, absolute, relative, context);
      packaged.refs.push({ ref, classification });
      switch (classification.kind) {
        case "file":
          queue.push(classification.absolutePath);
          break;
        case "primitive":
          crawled.primitives.add(classification.name);
          break;
        case "package":
          crawled.packages.set(classification.name, classification.range);
          break;
        case "ignored":
          if (classification.reason === "next") {
            crawled.nextImports.push(`${relative}: ${ref.specifier}`);
          }
          break;
        case "utils":
          break;
      }
    }
  }
  return crawled;
}

function assertNoForeignCycles(crawls: readonly Crawled[]): void {
  const graph = new Map(crawls.map((crawl) => [crawl.item.name, [...crawl.foreign]]));
  const visiting = new Set<string>();
  const done = new Set<string>();
  const visit = (name: string, trail: string[]): void => {
    if (done.has(name)) {
      return;
    }
    if (visiting.has(name)) {
      throw new Error(`registryDependency cycle: ${[...trail, name].join(" -> ")}`);
    }
    visiting.add(name);
    for (const dependency of graph.get(name) ?? []) {
      visit(dependency, [...trail, name]);
    }
    visiting.delete(name);
    done.add(name);
  };
  for (const name of graph.keys()) {
    visit(name, []);
  }
}

function toItemJson(
  crawl: Crawled,
  options: BuildOptions,
  ownerOf: (relative: string) => ItemDefinition | undefined,
  targetOf: (crawl: Crawled, relative: string) => string,
): RegistryItemJson {
  const { item } = crawl;
  const ownsHere = (relative: string): boolean => ownerOf(relative)?.name === item.name;

  const files: RegistryItemFile[] = [...crawl.files.values()].map((file) => {
    const edits: TextEdit[] = [];
    for (const { ref, classification } of file.refs) {
      if (classification.kind === "primitive" || classification.kind === "utils") {
        if (classification.specifier !== ref.specifier) {
          edits.push({ start: ref.start, end: ref.end, replacement: classification.specifier });
        }
        continue;
      }
      if (classification.kind !== "file") {
        continue;
      }
      const targetRelative = posix.relative(
        srcRootOf(options.repoRoot),
        classification.absolutePath,
      );
      // A relative import between two of this item's own files stays valid: both ends move together.
      if (ref.specifier.startsWith(".") && ownsHere(file.relative) && ownsHere(targetRelative)) {
        continue;
      }
      const replacement = aliasOf(targetOf(crawl, targetRelative));
      if (replacement !== ref.specifier) {
        edits.push({ start: ref.start, end: ref.end, replacement });
      }
    }
    const relative = file.relative;
    return {
      path: virtualPath(item.name, relative),
      type: fileRole(relative).type,
      target: targetOf(crawl, relative),
      content: applyEdits(file.source, edits),
    };
  });
  files.sort((left, right) => compare(left.target, right.target));

  const dependencies = [...crawl.packages.entries()]
    .sort(([left], [right]) => compare(left, right))
    .map(([name, range]) => `${name}@${range}`);

  const registryDependencies = [
    ...[...crawl.primitives].sort(compare),
    ...[...crawl.foreign].sort(compare).map((name) => `${options.baseUrl}/r/${name}.json`),
  ].sort(compare);

  const json: RegistryItemJson = {
    $schema: ITEM_SCHEMA,
    name: item.name,
    type: item.type,
    title: item.title,
    description: item.description,
    dependencies,
    registryDependencies,
    files,
  };
  const usesBareComponents = registryDependencies.some((entry) => !entry.startsWith("http"));
  const radixOnly = (options.radixOnlyItems ?? []).includes(item.name) && usesBareComponents;
  if (item.meta !== undefined || radixOnly) {
    json.meta = { ...item.meta, ...(radixOnly ? { primitives: "radix" as const } : {}) };
  }
  const bundle: StyleBundle =
    item.styles === undefined
      ? { css: {}, cssVars: {} }
      : extractStyles(options.fs.read(options.globalsCssPath), item.styles);
  const css = { ...(item.css ?? {}), ...bundle.css };
  if (Object.keys(css).length > 0) {
    json.css = css;
  }
  const cssVars = mergeCssVars(item.cssVars ?? {}, bundle.cssVars);
  if (Object.keys(cssVars).length > 0) {
    json.cssVars = cssVars;
  }
  const note = options.radixNote ?? "";
  if (radixOnly && note !== "") {
    json.docs =
      item.docs === undefined || item.docs === ""
        ? note
        : item.docs.includes(note)
          ? item.docs
          : `${item.docs} ${note}`;
  } else if (item.docs !== undefined) {
    json.docs = item.docs;
  }
  return json;
}

function mergeCssVars(first: RegistryCssVars, second: RegistryCssVars): RegistryCssVars {
  const merged: RegistryCssVars = {};
  for (const key of ["theme", "light", "dark"] as const) {
    const values = { ...(first[key] ?? {}), ...(second[key] ?? {}) };
    if (Object.keys(values).length > 0) {
      merged[key] = values;
    }
  }
  return merged;
}

function toRegistryIndex(
  options: BuildOptions,
  items: ReadonlyMap<string, RegistryItemJson>,
): object {
  return {
    $schema: REGISTRY_SCHEMA,
    name: options.siteName,
    homepage: options.baseUrl,
    items: [...items.values()].map((json) => ({
      name: json.name,
      type: json.type,
      title: json.title,
      description: json.description,
      dependencies: json.dependencies,
      registryDependencies: json.registryDependencies,
    })),
  };
}

export function stringifyJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
