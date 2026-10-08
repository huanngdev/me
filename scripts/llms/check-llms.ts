import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { LLMS_CATALOG, type LlmsCatalogEntry, type LlmsKind } from "./catalog.ts";
import { renderEntry, renderFull, renderIndex, updateLlmsTxt } from "./build-llms.ts";

const repoRoot: string = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function readRepoFile(relativePath: string): string {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function folderFor(kind: LlmsKind): "components" | "blocks" {
  return kind === "component" ? "components" : "blocks";
}

function bytesMatch(rendered: string, file: string): boolean {
  const lines: string[] = rendered.split("\n");
  const headingIndex: number = lines.indexOf(`## ${file}`);
  if (headingIndex < 0) {
    return false;
  }
  const fenceLine: string | undefined = lines[headingIndex + 1];
  if (fenceLine === undefined) {
    return false;
  }
  const match: RegExpExecArray | null = /^(`{3,})(tsx|ts|txt)$/.exec(fenceLine);
  const fence: string | undefined = match?.[1];
  if (fence === undefined) {
    return false;
  }
  const bodyLines: string[] = [];
  for (let index: number = headingIndex + 2; index < lines.length; index += 1) {
    const line: string | undefined = lines[index];
    if (line === undefined) {
      return false;
    }
    if (line === fence) {
      const body: string = bodyLines.join("\n");
      const source: string = readRepoFile(file);
      return source.endsWith("\n") ? body + "\n" === source : body === source;
    }
    bodyLines.push(line);
  }
  return false;
}

function collectFailures(): string[] {
  const failures: string[] = [];
  const rendered: string[] = [];

  for (const entry of LLMS_CATALOG) {
    const document: string = renderEntry(entry, readRepoFile);
    rendered.push(document);
    const relativePath: string = `apps/web/public/llms/${folderFor(entry.kind)}/${entry.slug}.txt`;
    if (readRepoFile(relativePath) !== document) {
      failures.push(`mismatch ${relativePath}`);
    }
  }

  const kinds: readonly LlmsKind[] = ["component", "block"];
  for (const kind of kinds) {
    const entries: LlmsCatalogEntry[] = LLMS_CATALOG.filter(
      (entry: LlmsCatalogEntry): boolean => entry.kind === kind,
    );
    const indexPath: string = `apps/web/public/llms/${folderFor(kind)}.txt`;
    if (readRepoFile(indexPath) !== renderIndex(kind, entries)) {
      failures.push(`mismatch ${indexPath}`);
    }
  }

  for (const kind of kinds) {
    const documents: string[] = [];
    for (let index: number = 0; index < LLMS_CATALOG.length; index += 1) {
      const entry: LlmsCatalogEntry | undefined = LLMS_CATALOG[index];
      const document: string | undefined = rendered[index];
      if (entry !== undefined && document !== undefined && entry.kind === kind) {
        documents.push(document);
      }
    }
    const fullPath: string = `apps/web/public/llms/${folderFor(kind)}-full.txt`;
    if (readRepoFile(fullPath) !== renderFull(kind, documents)) {
      failures.push(`mismatch ${fullPath}`);
    }
  }

  const llmsPath: string = "apps/web/public/llms.txt";
  const current: string = readRepoFile(llmsPath);
  if (updateLlmsTxt(current) !== current || !current.startsWith("# Ngô Gia Huấn\n")) {
    failures.push(`mismatch ${llmsPath}`);
  }

  for (let index: number = 0; index < LLMS_CATALOG.length; index += 1) {
    const entry: LlmsCatalogEntry | undefined = LLMS_CATALOG[index];
    const document: string | undefined = rendered[index];
    if (entry === undefined || document === undefined) {
      continue;
    }
    for (const file of entry.files) {
      if (!bytesMatch(document, file)) {
        failures.push(`bytes ${file}`);
      }
    }
  }

  const componentCount: number = LLMS_CATALOG.filter(
    (entry: LlmsCatalogEntry): boolean => entry.kind === "component",
  ).length;
  const blockCount: number = LLMS_CATALOG.filter(
    (entry: LlmsCatalogEntry): boolean => entry.kind === "block",
  ).length;
  if (LLMS_CATALOG.length !== 9 || componentCount !== 6 || blockCount !== 3) {
    failures.push("catalog count");
  }

  return failures;
}

function main(): number {
  const failures: string[] = collectFailures();
  for (const failure of failures) {
    console.error(failure);
  }
  return failures.length === 0 ? 0 : 1;
}

process.exitCode = main();
