import {
  resolveCommands,
  type PackageManager,
} from "@repo/core/components/cli-command/package-managers";
import { PUBLIC_PORTFOLIO_URL } from "@repo/core/constants";

import { COMPONENT_DOCS } from "../../content/component-docs";
import type { ComponentDocs } from "../../content/component-docs/types";
import {
  findRegistryInstall,
  namespaceSnippet,
  REGISTRY_NAMESPACE,
  registryItemUrl,
  TESTED_WITH,
  type RegistryInstallInfo,
} from "../registry-install";

import { readRegistryIndex, readRegistryItem, type RegistryIndexItem } from "./registry-source";

/*
 * Pure catalog functions for the MCP tools. No MCP SDK imports here: each function returns a
 * plain JSON-able object, and the route layer only maps inputs and outputs.
 */

export type ItemKind = "component" | "block";
export type SearchType = ItemKind | "all";
export type InstallForm = "url" | "namespace";

export type CatalogSummary = {
  name: string;
  title: string;
  type: ItemKind;
  description: string;
  docsUrl: string;
  npmPackages: string[];
  shadcnComponents: string[];
};

export type SearchInput = { query?: string; type?: SearchType; limit?: number; offset?: number };

export type SearchResult = {
  items: CatalogSummary[];
  total: number;
  hasMore: boolean;
  nextOffset: number | null;
  note?: string;
};

export type DocsResult =
  { ok: true; name: string; markdown: string } | { ok: false; error: string };

export type SourceFileSummary = { file: string; target: string; type: string; lines: number };

export type SourceListInput = { name: string; file?: undefined };
export type SourceSliceInput = {
  name: string;
  file: string;
  startLine?: number;
  maxLines?: number;
};

export type SourceListResult = { ok: true; name: string; files: SourceFileSummary[] };

export type SourceSliceResult = {
  ok: true;
  name: string;
  file: string;
  target: string;
  startLine: number;
  endLine: number;
  totalLines: number;
  hasMore: boolean;
  nextStartLine: number | null;
  content: string;
};

export type SourceResult = SourceListResult | SourceSliceResult | { ok: false; error: string };

export type InstallCommandInput = {
  names: string[];
  packageManager?: PackageManager;
  form?: InstallForm;
};

export type InstallItemSummary = {
  name: string;
  directory: string;
  files: number;
  npmPackages: string[];
  shadcnComponents: string[];
};

export type InstallCommandResult =
  | {
      ok: true;
      command: string;
      commands: Record<PackageManager, string>;
      packageManager: PackageManager;
      form: InstallForm;
      namespaceConfig: string | null;
      items: InstallItemSummary[];
      prerequisites: string[];
    }
  | { ok: false; error: string };

const DEFAULT_SEARCH_LIMIT = 20;
const MAX_SEARCH_LIMIT = 50;
const DEFAULT_MAX_LINES = 400;
const MAX_MAX_LINES = 1000;
const MAX_INSTALL_ITEMS = 10;
const MAX_SUGGESTIONS = 3;

const KIND_BY_REGISTRY_TYPE: Readonly<Record<string, ItemKind | undefined>> = {
  "registry:component": "component",
  "registry:block": "block",
};

/** Docs exist for components only. Blocks have no docs entry. */
const DOCS_BY_SLUG: Readonly<Record<string, ComponentDocs | undefined>> = COMPONENT_DOCS;

/** Blocks have no docs entry, so their search keywords live here. */
const BLOCK_KEYWORDS: Record<string, readonly string[]> = {
  "crm-data-table": ["table", "crm", "customers", "dashboard", "data grid", "admin"],
  "error-page": ["error", "500", "404", "not found", "fallback"],
  "notion-like-editor": [
    "editor",
    "rich text",
    "notion",
    "wysiwyg",
    "markdown",
    "plate",
    "document",
  ],
};

type CatalogEntry = {
  index: RegistryIndexItem;
  kind: ItemKind;
  install: RegistryInstallInfo;
};

function keywordsFor(entry: CatalogEntry): readonly string[] {
  return entry.kind === "component"
    ? (DOCS_BY_SLUG[entry.index.name]?.keywords ?? [])
    : (BLOCK_KEYWORDS[entry.index.name] ?? []);
}

/** Every registry item that has a kind and install facts, in index order. */
function catalogEntries(): CatalogEntry[] {
  return readRegistryIndex().flatMap((index) => {
    const kind = KIND_BY_REGISTRY_TYPE[index.type];
    const install = findRegistryInstall(index.name);
    return kind === undefined || install === undefined ? [] : [{ index, kind, install }];
  });
}

function findEntry(name: string): CatalogEntry | undefined {
  return catalogEntries().find((entry) => entry.index.name === name);
}

function docsUrl(entry: CatalogEntry): string {
  const section = entry.kind === "component" ? "components" : "blocks";
  return `${PUBLIC_PORTFOLIO_URL}/${section}/${entry.index.name}`;
}

function toSummary(entry: CatalogEntry): CatalogSummary {
  return {
    name: entry.index.name,
    title: entry.index.title,
    type: entry.kind,
    description: entry.index.description,
    docsUrl: docsUrl(entry),
    npmPackages: [...entry.install.npmPackages],
    shadcnComponents: [...entry.install.shadcnComponents],
  };
}

/** Clamps a number input. Missing or non-finite values fall back to the default. */
function clampInt(value: number | undefined, fallback: number, min: number, max: number): number {
  if (value === undefined || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

function queryWords(query: string | undefined): string[] {
  return (query ?? "")
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word !== "");
}

/**
 * Per query word: the best name, title, or description tier that matches, plus 20 when a keyword
 * contains the word. Scores add up across words.
 */
function scoreEntry(entry: CatalogEntry, words: readonly string[]): number {
  const name = entry.index.name.toLowerCase();
  const nameParts = name.split("-");
  const title = entry.index.title.toLowerCase();
  const description = entry.index.description.toLowerCase();
  const keywords = keywordsFor(entry).map((keyword) => keyword.toLowerCase());
  return words.reduce((total, word) => {
    let score = 0;
    if (name === word) {
      score = 100;
    } else if (nameParts.includes(word)) {
      score = 60;
    } else if (name.includes(word)) {
      score = 50;
    } else if (title.includes(word)) {
      score = 40;
    } else if (description.includes(word)) {
      score = 10;
    }
    if (keywords.some((keyword) => keyword.includes(word))) {
      score += 20;
    }
    return total + score;
  }, 0);
}

export function searchItems(input: SearchInput = {}): SearchResult {
  const type = input.type ?? "all";
  const limit = clampInt(input.limit, DEFAULT_SEARCH_LIMIT, 1, MAX_SEARCH_LIMIT);
  const offset = clampInt(input.offset, 0, 0, Number.MAX_SAFE_INTEGER);
  const words = queryWords(input.query);

  const candidates = catalogEntries().filter((entry) => type === "all" || entry.kind === type);

  let ranked: CatalogEntry[];
  let note: string | undefined;
  if (words.length === 0) {
    ranked = candidates;
  } else {
    const matches = candidates
      .map((entry) => ({ entry, score: scoreEntry(entry, words) }))
      .filter((match) => match.score > 0)
      .sort((a, b) => b.score - a.score || a.entry.index.name.localeCompare(b.entry.index.name));
    if (matches.length === 0) {
      ranked = candidates;
      note = `No direct match for "${input.query?.trim() ?? ""}"; showing every item instead.`;
    } else {
      ranked = matches.map((match) => match.entry);
    }
  }

  const total = ranked.length;
  const page = ranked.slice(offset, offset + limit);
  const hasMore = offset + limit < total;
  return {
    items: page.map(toSummary),
    total,
    hasMore,
    nextOffset: hasMore ? offset + limit : null,
    ...(note === undefined ? {} : { note }),
  };
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/** A fenced block whose fence is longer than any backtick run inside the code. */
function fence(language: string, code: string): string {
  const longestRun = Math.max(0, ...(code.match(/`+/g) ?? []).map((run) => run.length));
  const marks = "`".repeat(Math.max(3, longestRun + 1));
  return `${marks}${language}\n${code}\n${marks}`;
}

function escapeCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function bullets(lines: readonly string[]): string {
  return lines.map((line) => `- ${line}`).join("\n");
}

function installSection(entry: CatalogEntry): string {
  const { install } = entry;
  const url = registryItemUrl(entry.index.name);
  const command = resolveCommands({ execute: `shadcn@latest add ${url}` }).npm;

  const facts: string[] = [];
  const fileCount = install.ownFileCount + install.helperFileCount;
  const directoryPart = `${plural(fileCount, "file")} in \`${install.directory}/\``;
  facts.push(
    install.helperFileCount > 0 && install.helperDirectory !== null
      ? `${directoryPart}, plus ${plural(install.helperFileCount, "shared helper file")} in \`${install.helperDirectory}/\``
      : directoryPart,
  );
  if (install.npmPackages.length > 0) {
    facts.push(`npm packages: ${install.npmPackages.join(", ")}`);
  }
  if (install.shadcnComponents.length > 0) {
    facts.push(`shadcn components it depends on: ${install.shadcnComponents.join(", ")}`);
  }
  if (install.registryItems.length > 0) {
    facts.push(`other items it needs: ${install.registryItems.join(", ")}`);
  }
  if (install.primitives === "radix") {
    facts.push("Requires Radix-based shadcn components. Base UI styles are not supported.");
  }
  if (install.framework === "next") {
    facts.push("Requires Next.js.");
  }

  return ["## Install", "Run from the project root:", fence("bash", command), bullets(facts)].join(
    "\n\n",
  );
}

function propsSection(docs: ComponentDocs): string {
  if (docs.props.length === 0) {
    return "## Props\n\nNo props.";
  }
  const rows = docs.props.map(
    (prop) =>
      `| ${escapeCell(prop.name)} | ${escapeCell(prop.type)} | ${escapeCell(prop.default)} | ${escapeCell(prop.description)} |`,
  );
  return [
    "## Props",
    ["| Prop | Type | Default | Description |", "| --- | --- | --- | --- |", ...rows].join("\n"),
  ].join("\n\n");
}

function examplesSection(docs: ComponentDocs): string | undefined {
  if (docs.examples.length === 0) {
    return undefined;
  }
  const blocks = docs.examples.map((example) =>
    [`### ${example.title}`, example.description, fence(example.language ?? "tsx", example.code)]
      .filter((part): part is string => part !== undefined)
      .join("\n\n"),
  );
  return ["## Examples", ...blocks].join("\n\n");
}

function notesSection(docs: ComponentDocs): string | undefined {
  if (docs.notes.length === 0) {
    return undefined;
  }
  const blocks = docs.notes.map((note) => `### ${note.title}\n\n${bullets(note.items)}`);
  return ["## Notes", ...blocks].join("\n\n");
}

export function getItemDocs(name: string): DocsResult {
  const entry = findEntry(name);
  if (entry === undefined) {
    return { ok: false, error: unknownItemError(name) };
  }

  const sections: string[] = [
    `# ${entry.index.title}`,
    entry.index.description,
    `Docs: ${docsUrl(entry)}`,
    installSection(entry),
  ];

  if (entry.kind === "block") {
    const item = readRegistryItem(name);
    if (item === undefined) {
      return { ok: false, error: `The registry JSON for "${name}" could not be read.` };
    }
    const targets = item.files.map((file) => `- \`${file.target}\``);
    sections.push(["## Files", targets.join("\n")].join("\n\n"));
  } else {
    const docs = DOCS_BY_SLUG[name];
    if (docs === undefined) {
      return { ok: false, error: `No docs are written for "${name}" yet.` };
    }
    sections.push(["## Usage", fence("tsx", docs.usage)].join("\n\n"));
    const examples = examplesSection(docs);
    if (examples !== undefined) {
      sections.push(examples);
    }
    sections.push(propsSection(docs));
    sections.push(["## Types", fence("ts", docs.types)].join("\n\n"));
    const notes = notesSection(docs);
    if (notes !== undefined) {
      sections.push(notes);
    }
  }

  return { ok: true, name, markdown: `${sections.join("\n\n")}\n` };
}

/**
 * Splits content into lines. A trailing newline does not add an empty last line, so the line
 * count matches what an editor shows.
 */
function splitLines(content: string): string[] {
  const lines = content.split("\n");
  if (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }
  return lines;
}

function relativeFilePath(name: string, registryPath: string): string {
  const prefix = `registry/default/${name}/`;
  return registryPath.startsWith(prefix) ? registryPath.slice(prefix.length) : registryPath;
}

export function getItemSource(input: SourceListInput | SourceSliceInput): SourceResult {
  const entry = findEntry(input.name);
  if (entry === undefined) {
    return { ok: false, error: unknownItemError(input.name) };
  }
  const item = readRegistryItem(input.name);
  if (item === undefined) {
    return { ok: false, error: `The registry JSON for "${input.name}" could not be read.` };
  }

  const files = item.files.map((file) => ({
    file: relativeFilePath(input.name, file.path),
    target: file.target,
    type: file.type,
    content: file.content,
  }));

  if (input.file === undefined) {
    return {
      ok: true,
      name: input.name,
      files: files.map((file) => ({
        file: file.file,
        target: file.target,
        type: file.type,
        lines: splitLines(file.content).length,
      })),
    };
  }

  const match = files.find((file) => file.file === input.file);
  if (match === undefined) {
    const valid = files.map((file) => file.file).join(", ");
    return {
      ok: false,
      error: `No file "${input.file}" in ${input.name}. Valid files: ${valid}.`,
    };
  }

  const startLine = clampInt(input.startLine, 1, 1, Number.MAX_SAFE_INTEGER);
  const maxLines = clampInt(input.maxLines, DEFAULT_MAX_LINES, 1, MAX_MAX_LINES);
  const lines = splitLines(match.content);
  const slice = lines.slice(startLine - 1, startLine - 1 + maxLines);
  const endLine = Math.min(startLine - 1 + slice.length, lines.length);
  const hasMore = endLine < lines.length;

  return {
    ok: true,
    name: input.name,
    file: match.file,
    target: match.target,
    startLine,
    endLine,
    totalLines: lines.length,
    hasMore,
    nextStartLine: hasMore ? endLine + 1 : null,
    content: slice.join("\n"),
  };
}

function longestCommonSubstring(a: string, b: string): number {
  let best = 0;
  let previous = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    const current = new Array<number>(b.length + 1).fill(0);
    for (let j = 1; j <= b.length; j++) {
      if (a[i - 1] === b[j - 1]) {
        const length = (previous[j - 1] ?? 0) + 1;
        current[j] = length;
        best = Math.max(best, length);
      }
    }
    previous = current;
  }
  return best;
}

/** Up to three names that share a substring with the input. Needs at least three shared characters. */
function suggestNames(input: string, candidates: readonly string[]): string[] {
  const needle = input.trim().toLowerCase();
  if (needle === "") {
    return [];
  }
  const minimumShared = Math.min(3, needle.length);
  return candidates
    .map((candidate) => ({ candidate, shared: longestCommonSubstring(needle, candidate) }))
    .filter((match) => match.shared >= minimumShared)
    .sort((a, b) => b.shared - a.shared || a.candidate.localeCompare(b.candidate))
    .slice(0, MAX_SUGGESTIONS)
    .map((match) => match.candidate);
}

export function unknownItemError(name: string): string {
  const suggestions = suggestNames(
    name,
    catalogEntries().map((entry) => entry.index.name),
  );
  const hint = suggestions.length > 0 ? ` Did you mean: ${suggestions.join(", ")}?` : "";
  return `No item named "${name}".${hint} Call search_components to list items.`;
}

export function getInstallCommand(input: InstallCommandInput): InstallCommandResult {
  const names = [...new Set(input.names)];
  if (names.length === 0 || names.length > MAX_INSTALL_ITEMS) {
    return {
      ok: false,
      error: `Pass between 1 and ${MAX_INSTALL_ITEMS} item names. Call search_components to list items.`,
    };
  }

  const packageManager = input.packageManager ?? "npm";
  const form = input.form ?? "url";

  const entries: CatalogEntry[] = [];
  const errors: string[] = [];
  for (const name of names) {
    const entry = findEntry(name);
    if (entry === undefined) {
      errors.push(unknownItemError(name));
    } else {
      entries.push(entry);
    }
  }
  if (errors.length > 0) {
    return { ok: false, error: errors.join(" ") };
  }

  const args = entries.map((entry) =>
    form === "url"
      ? registryItemUrl(entry.index.name)
      : `${REGISTRY_NAMESPACE}/${entry.index.name}`,
  );
  const commands = resolveCommands({ execute: `shadcn@latest add ${args.join(" ")}` });
  const initCommand = resolveCommands({ execute: "shadcn@latest init" })[packageManager];

  return {
    ok: true,
    command: commands[packageManager],
    commands,
    packageManager,
    form,
    namespaceConfig: form === "namespace" ? namespaceSnippet() : null,
    items: entries.map((entry) => ({
      name: entry.index.name,
      directory: entry.install.directory,
      files: entry.install.ownFileCount + entry.install.helperFileCount,
      npmPackages: [...entry.install.npmPackages],
      shadcnComponents: [...entry.install.shadcnComponents],
    })),
    prerequisites: [
      "Run from the project root.",
      `The project needs a components.json; run \`${initCommand}\` first if it has none.`,
      `Tested with ${TESTED_WITH} on Next.js and Vite, Tailwind v4.`,
    ],
  };
}
