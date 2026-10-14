import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Install facts for the docs, read at build time from the file the registry build writes into
 * `apps/web`. File counts, directories, packages and primitives therefore always match the
 * published `notion-like-editor.json`.
 */

export type RegistrySummaryItem = {
  name: string;
  ownFileCount: number;
  helperFileCount: number;
  directory: string;
  helperDirectory: string | null;
  npmPackages: string[];
  shadcnComponents: string[];
  registryItems: string[];
  cssRules: number;
  primitives: string | null;
  docs: string | null;
};

type RegistrySummary = {
  testedWith: string;
  items: RegistrySummaryItem[];
};

const REPO_ROOT = process.cwd().endsWith("apps/richcn")
  ? path.resolve(process.cwd(), "../..")
  : process.cwd();

const SUMMARY_PATH = path.join(
  REPO_ROOT,
  "apps",
  "web",
  "src",
  "generated",
  "registry-summary.json",
);

const summary = JSON.parse(readFileSync(SUMMARY_PATH, "utf8")) as RegistrySummary;

function findItem(): RegistrySummaryItem {
  const item = summary.items.find((candidate) => candidate.name === "notion-like-editor");
  if (item === undefined) {
    throw new Error(`registry-summary.json has no notion-like-editor item (${SUMMARY_PATH})`);
  }

  return item;
}

/** The shadcn version the registry is tested against. */
export const TESTED_WITH = summary.testedWith;

export const EDITOR_INSTALL = findItem();

type RegistryCssVars = {
  theme?: Record<string, string>;
  light?: Record<string, string>;
  dark?: Record<string, string>;
};

const ITEM_PATH = path.join(REPO_ROOT, "apps", "web", "public", "r", "notion-like-editor.json");

const registryItem = JSON.parse(readFileSync(ITEM_PATH, "utf8")) as { cssVars?: RegistryCssVars };

/** The custom properties the published registry item writes into a project's stylesheet. */
export const EDITOR_CSS_VARS = {
  light: Object.keys(registryItem.cssVars?.light ?? {}).sort(),
  dark: Object.keys(registryItem.cssVars?.dark ?? {}).sort(),
  theme: Object.keys(registryItem.cssVars?.theme ?? {}).sort(),
};

export const REGISTRY_NAMESPACE = "@huanngdev";

export const REGISTRY_ITEM_URL = "https://www.huanngdev.site/r/notion-like-editor.json";

/** The `shadcn add` argument for the URL form, for `CliCommand`'s `execute`. */
export const INSTALL_COMMAND = `shadcn@latest add ${REGISTRY_ITEM_URL}`;

/** The same install through the namespace, once the namespace is registered. */
export const INSTALL_COMMAND_BY_NAME = `shadcn@latest add ${REGISTRY_NAMESPACE}/notion-like-editor`;

/** The `components.json` entry that registers the namespace once per project. */
export const NAMESPACE_SNIPPET = JSON.stringify(
  { registries: { [REGISTRY_NAMESPACE]: "https://www.huanngdev.site/r/{name}.json" } },
  null,
  2,
);

export function plural(count: number, noun: string): string {
  return `${String(count)} ${noun}${count === 1 ? "" : "s"}`;
}
