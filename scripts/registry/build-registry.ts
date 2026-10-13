import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildRegistry,
  stringifyJson,
  type BuildResult,
  type CorePackageJson,
  type FileSystem,
} from "./lib/build.ts";
import { ITEMS, RADIX_NOTE, RADIX_ONLY_ITEMS } from "./items.ts";
import { SHADCN_PRIMITIVES } from "./primitives.ts";
import { PINNED_VERSIONS } from "./versions.ts";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const SITE_NAME = "huanngdev";
export const DEFAULT_OUTPUT_DIR = join(ROOT, "apps/web/public/r");
/** Summary the docs pages import, so install lists come from the registry and cannot drift. */
export const SUMMARY_PATH = join(ROOT, "apps/web/src/generated/registry-summary.json");

export const nodeFileSystem: FileSystem = {
  isFile(absolutePath: string): boolean {
    try {
      return statSync(absolutePath).isFile();
    } catch {
      return false;
    }
  },
  read(absolutePath: string): string {
    return readFileSync(absolutePath, "utf8");
  },
};

/** Reads `PUBLIC_PORTFOLIO_URL` from constants.ts without importing the module (it pulls React and icons). */
export function readPublicSiteUrl(repoRoot: string): string {
  const source = readFileSync(join(repoRoot, "packages/core/src/constants.ts"), "utf8");
  const match = /export const PUBLIC_PORTFOLIO_URL = "([^"]+)"/.exec(source);
  if (match?.[1] === undefined) {
    throw new Error("PUBLIC_PORTFOLIO_URL not found in packages/core/src/constants.ts");
  }
  return match[1].replace(/\/+$/, "");
}

export type RegistryRunOptions = {
  repoRoot?: string;
  baseUrl?: string;
};

export function buildPortfolioRegistry(options: RegistryRunOptions = {}): BuildResult {
  const repoRoot = options.repoRoot ?? ROOT;
  const baseUrl = (
    options.baseUrl ??
    process.env.REGISTRY_BASE_URL ??
    readPublicSiteUrl(repoRoot)
  ).replace(/\/+$/, "");
  const corePackage = JSON.parse(
    readFileSync(join(repoRoot, "packages/core/package.json"), "utf8"),
  ) as CorePackageJson;
  return buildRegistry({
    repoRoot,
    baseUrl,
    items: ITEMS,
    fs: nodeFileSystem,
    primitives: SHADCN_PRIMITIVES,
    corePackage,
    globalsCssPath: join(repoRoot, "packages/core/src/styles/globals.css"),
    siteName: SITE_NAME,
    radixOnlyItems: RADIX_ONLY_ITEMS,
    radixNote: RADIX_NOTE,
  });
}

export type RegistrySummaryItem = {
  name: string;
  title: string;
  type: string;
  /** Files in the item's own directory. */
  ownFileCount: number;
  /** Shared helper files, installed under the item namespace. ownFileCount + helperFileCount is the JSON file count. */
  helperFileCount: number;
  /** Install directory of the item's own files, for example `components/audio-player`. */
  directory: string;
  /** Shared helpers installed under the item's namespace, for example `components/huanngdev/notion-like-editor`. */
  helperDirectory: string | null;
  npmPackages: string[];
  shadcnComponents: string[];
  registryItems: string[];
  cssRules: number;
  framework: "next" | null;
  /** "radix" when the item only works with Radix-based shadcn primitives. */
  primitives: "radix" | null;
  docs: string | null;
};

/** Longest directory prefix shared by a list of `@alias/...` targets, without the leading `@`. */
export function commonDirectory(targets: readonly string[]): string {
  const folders = targets.map((target) => target.slice(1).split("/").slice(0, -1));
  const first = folders[0] ?? [];
  let length = first.length;
  for (const folder of folders) {
    let index = 0;
    while (index < length && folder[index] === first[index]) index += 1;
    length = index;
  }
  return first.slice(0, length).join("/");
}

export function buildSummary(result: BuildResult): string {
  const items: RegistrySummaryItem[] = [...result.items.values()].map((json) => {
    const owned = json.files
      .filter((file) => !file.target.startsWith("@components/huanngdev/"))
      .map((file) => file.target);
    const helpers = json.files
      .filter((file) => file.target.startsWith("@components/huanngdev/"))
      .map((file) => file.target);
    return {
      name: json.name,
      title: json.title,
      type: json.type,
      ownFileCount: owned.length,
      helperFileCount: helpers.length,
      directory: commonDirectory(owned),
      helperDirectory: helpers.length > 0 ? `components/huanngdev/${json.name}` : null,
      npmPackages: json.dependencies.map((entry) => entry.slice(0, entry.lastIndexOf("@"))).sort(),
      shadcnComponents: json.registryDependencies.filter((entry) => !entry.startsWith("http")),
      registryItems: json.registryDependencies
        .filter((entry) => entry.startsWith("http"))
        .map((entry) => entry.slice(entry.lastIndexOf("/") + 1).replace(/\.json$/, "")),
      cssRules: json.css === undefined ? 0 : Object.keys(json.css).length,
      framework: json.meta?.framework ?? null,
      primitives: json.meta?.primitives ?? null,
      docs: json.docs ?? null,
    };
  });
  return stringifyJson({ testedWith: `shadcn ${PINNED_VERSIONS.shadcn}`, items });
}

export function writeRegistry(result: BuildResult, outputDir: string): void {
  mkdirSync(outputDir, { recursive: true });
  for (const [fileName, text] of result.outputs) {
    writeFileSync(join(outputDir, fileName), text, "utf8");
  }
}

function main(): void {
  const outputDir = process.env.REGISTRY_OUT_DIR ?? DEFAULT_OUTPUT_DIR;
  const result = buildPortfolioRegistry();
  writeRegistry(result, outputDir);
  if (process.env.REGISTRY_OUT_DIR === undefined) {
    mkdirSync(dirname(SUMMARY_PATH), { recursive: true });
    writeFileSync(SUMMARY_PATH, buildSummary(result), "utf8");
  }
  for (const [name, item] of result.items) {
    console.log(
      `${name}: ${item.files.length} files, ${item.dependencies.length} packages, ${item.registryDependencies.length} registry deps`,
    );
  }
  console.log(`wrote ${result.outputs.size} files to ${outputDir}`);
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
