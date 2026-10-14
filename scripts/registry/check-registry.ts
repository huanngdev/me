import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildPortfolioRegistry,
  buildSummary,
  DEFAULT_OUTPUT_DIR,
  readPublicSiteUrl,
  ROOT,
  SUMMARY_PATH,
} from "./build-registry.ts";

/**
 * Rebuilds the registry in memory and compares it byte-for-byte with `apps/web/public/r`.
 * The public site URL is passed explicitly, so a stray REGISTRY_BASE_URL cannot change the check.
 */
export function collectRegistryFailures(outputDir: string = DEFAULT_OUTPUT_DIR): string[] {
  const failures: string[] = [];
  const expected = buildPortfolioRegistry({ baseUrl: readPublicSiteUrl(ROOT) }).outputs;

  for (const [fileName, text] of expected) {
    const absolute = join(outputDir, fileName);
    if (!existsSync(absolute)) {
      failures.push(`missing ${fileName}`);
    } else if (readFileSync(absolute, "utf8") !== text) {
      failures.push(`mismatch ${fileName}`);
    }
  }

  const summaryText = buildSummary(buildPortfolioRegistry({ baseUrl: readPublicSiteUrl(ROOT) }));
  if (!existsSync(SUMMARY_PATH)) {
    failures.push("missing apps/web/src/generated/registry-summary.json");
  } else if (readFileSync(SUMMARY_PATH, "utf8") !== summaryText) {
    failures.push("mismatch apps/web/src/generated/registry-summary.json");
  }

  if (existsSync(outputDir)) {
    for (const fileName of readdirSync(outputDir)) {
      if (fileName.endsWith(".json") && !expected.has(fileName)) {
        failures.push(`unexpected ${fileName}`);
      }
    }
  }
  return failures;
}

function main(): number {
  const failures = collectRegistryFailures();
  for (const failure of failures) {
    console.error(failure);
  }
  return failures.length === 0 ? 0 : 1;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
