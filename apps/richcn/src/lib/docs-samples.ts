import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * The docs samples are real files under `src/docs-samples/`, so `check-types` covers them and a
 * sample cannot drift from the editor's types. A type block that is quoted from the editor's own
 * source is read from that source instead, so it cannot drift either.
 */

const REPO_ROOT = process.cwd().endsWith("apps/richcn")
  ? path.resolve(process.cwd(), "../..")
  : process.cwd();

const APP_DIR = process.cwd().endsWith("apps/richcn")
  ? process.cwd()
  : path.join(process.cwd(), "apps/richcn");

const SAMPLES_DIR = path.join(APP_DIR, "src", "docs-samples");

const EDITOR_DIR = path.join(
  REPO_ROOT,
  "packages",
  "core",
  "src",
  "components",
  "blocks",
  "notion-like-editor",
);

/** The docs are written for an installed copy, not for this repository. */
const MONOREPO_PREFIX = "@repo/core/components/blocks/notion-like-editor";
const PUBLIC_PREFIX = "@/components/blocks/notion-like-editor";

function publicImports(source: string): string {
  // The samples import the barrel through its `/index` file. The installed path a reader copies is
  // the folder, so the redundant `/index` is dropped before the prefix rewrite touches it.
  return source
    .replaceAll(`${MONOREPO_PREFIX}/index`, PUBLIC_PREFIX)
    .replaceAll(MONOREPO_PREFIX, PUBLIC_PREFIX)
    .trimEnd();
}

/** One docs sample, shown with the import path an installed copy uses. */
export function readSample(name: string): string {
  return publicImports(readFileSync(path.join(SAMPLES_DIR, name), "utf8"));
}

/** One file from the editor's own source, for a type block quoted in the docs. */
export function readEditorFile(relativePath: string): string {
  return publicImports(readFileSync(path.join(EDITOR_DIR, relativePath), "utf8"));
}
