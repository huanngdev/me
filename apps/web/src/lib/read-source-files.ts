import { readFileSync } from "node:fs";
import path from "node:path";

import type { BlockFile } from "@repo/core/components/layouts/block-preview-frame";

const REPO_ROOT = process.cwd().endsWith("apps/web")
  ? path.resolve(process.cwd(), "../..")
  : process.cwd();

const CORE_SRC_PREFIX = "packages/core/src/";

/** Reads repo-root source paths for a preview's Code tab. Display paths drop the `packages/core/src/` prefix. */
export function readSourceFiles(paths: readonly string[]): BlockFile[] {
  return paths.map((sourcePath) => ({
    path: sourcePath.startsWith(CORE_SRC_PREFIX)
      ? sourcePath.slice(CORE_SRC_PREFIX.length)
      : sourcePath,
    code: readFileSync(path.join(REPO_ROOT, sourcePath), "utf8"),
  }));
}
