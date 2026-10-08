import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const path = { dirname, extname, join, resolve };

import { LLMS_CATALOG, type LlmsCatalogEntry } from "./catalog.ts";

export const SITE = "https://www.huanngdev.site";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

type KindMeta = {
  title: string;
  folder: string;
  blurb: string;
};

function metaFor(kind: LlmsCatalogEntry["kind"]): KindMeta {
  if (kind === "component") {
    return {
      title: "Components",
      folder: "components",
      blurb:
        "Source for the portfolio component showcase. Each link is one component. File contents are copied byte-for-byte from the repository.",
    };
  }
  if (kind === "block") {
    return {
      title: "Blocks",
      folder: "blocks",
      blurb:
        "Source for the portfolio page blocks. Each link is one block. File contents are copied byte-for-byte from the repository.",
    };
  }
  throw new Error(`Unknown llms kind: ${String(kind)}`);
}

export function fenceFor(source: string): string {
  let longest = 0;
  let current = 0;
  for (const character of source) {
    if (character === "`") {
      current += 1;
      if (current > longest) {
        longest = current;
      }
    } else {
      current = 0;
    }
  }
  return "`".repeat(Math.max(3, longest + 1));
}

function languageFor(filePath: string): string {
  const extension = path.extname(filePath);
  if (extension === ".tsx") {
    return "tsx";
  }
  if (extension === ".ts") {
    return "ts";
  }
  return "txt";
}

function isEnoent(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function readAbsolute(absolute: string): string {
  try {
    return readFileSync(absolute, "utf8");
  } catch (error: unknown) {
    if (isEnoent(error)) {
      throw new Error(`Missing file: ${absolute}`);
    }
    throw error;
  }
}

function writeText(relativePath: string, contents: string): void {
  const absolute = path.join(ROOT, relativePath);
  mkdirSync(path.dirname(absolute), { recursive: true });
  writeFileSync(absolute, contents, "utf8");
}

export function renderEntry(
  entry: LlmsCatalogEntry,
  read: (relativePath: string) => string,
): string {
  const lines: string[] = [
    `# ${entry.name}`,
    "",
    `> ${entry.description}`,
    "",
    `- Kind: ${entry.kind}`,
    `- Docs: ${SITE}${entry.docsPath}`,
  ];
  if (entry.registryPath !== undefined) {
    lines.push(`- Registry: ${SITE}${entry.registryPath}`);
  }
  lines.push(
    "- Apply: copy each file to the same path from the repository root. Leave the bytes unchanged.",
  );
  lines.push("");
  lines.push("## Read order");
  lines.push("");
  entry.files.forEach((file, index) => {
    lines.push(`${index + 1}. ${file}`);
  });
  lines.push("");
  for (const file of entry.files) {
    const source = read(file);
    const body = source.endsWith("\n") ? source.slice(0, -1) : source;
    lines.push(`## ${file}`);
    lines.push(`${fenceFor(source)}${languageFor(file)}`);
    lines.push(body);
    lines.push(fenceFor(source));
    lines.push("");
  }
  return lines.join("\n");
}

export function renderIndex(
  kind: LlmsCatalogEntry["kind"],
  entries: readonly LlmsCatalogEntry[],
): string {
  const meta = metaFor(kind);
  const lines: string[] = [`# ${meta.title}`, "", `> ${meta.blurb}`, ""];
  for (const entry of entries) {
    if (entry.kind !== kind) {
      continue;
    }
    lines.push(
      `- [${entry.name}](${SITE}/llms/${meta.folder}/${entry.slug}.txt): ${entry.description}`,
    );
  }
  lines.push("");
  lines.push("## Optional");
  lines.push("");
  lines.push(
    `- [All ${meta.title.toLowerCase()}](${SITE}/llms/${meta.folder}-full.txt): Every ${kind} source file in one document.`,
  );
  lines.push("");
  return lines.join("\n");
}

export function renderFull(kind: LlmsCatalogEntry["kind"], documents: readonly string[]): string {
  const meta = metaFor(kind);
  const header = [
    `# ${meta.title}`,
    "",
    `> Full source. Prefer ${SITE}/llms/${meta.folder}/<slug>.txt when you only need one ${kind}.`,
  ].join("\n");
  return `${header}\n\n${documents.join("\n---\n\n")}`;
}

export function updateLlmsTxt(current: string): string {
  const section = [
    "## Code",
    "",
    "Source for the component showcase and page blocks. Each linked file copies the repository source byte-for-byte.",
    "",
    `- [Components](${SITE}/llms/components.txt): Six showcase components.`,
    `- [Blocks](${SITE}/llms/blocks.txt): Three full-page blocks.`,
    "",
  ].join("\n");
  const heading = "## Code\n";
  if (current.startsWith(heading)) {
    return section;
  }
  const marker = `\n${heading}`;
  const index = current.indexOf(marker);
  if (index !== -1) {
    return `${current.slice(0, index + 1)}${section}`;
  }
  if (current.length > 0 && !current.endsWith("\n")) {
    return `${current}\n${section}`;
  }
  return `${current}${section}`;
}

function readRepo(relativePath: string): string {
  return readAbsolute(path.join(ROOT, relativePath));
}

function publishKind(kind: LlmsCatalogEntry["kind"], read: (relativePath: string) => string): void {
  const meta = metaFor(kind);
  const documents: string[] = [];
  for (const entry of LLMS_CATALOG) {
    if (entry.kind !== kind) {
      continue;
    }
    const document = renderEntry(entry, read);
    documents.push(document);
    writeText(`apps/web/public/llms/${meta.folder}/${entry.slug}.txt`, document);
  }
  writeText(`apps/web/public/llms/${meta.folder}.txt`, renderIndex(kind, LLMS_CATALOG));
  writeText(`apps/web/public/llms/${meta.folder}-full.txt`, renderFull(kind, documents));
}

function main(): void {
  publishKind("component", readRepo);
  publishKind("block", readRepo);
  const llmsPath = path.join(ROOT, "apps/web/public/llms.txt");
  writeFileSync(llmsPath, updateLlmsTxt(readAbsolute(llmsPath)), "utf8");
}

function isDirectExecution(): boolean {
  const invoked = process.argv[1];
  if (invoked === undefined) {
    return false;
  }
  return path.resolve(invoked) === fileURLToPath(import.meta.url);
}

if (isDirectExecution()) {
  main();
}
