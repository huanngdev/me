import { describe, expect, test } from "bun:test";

import {
  buildPortfolioRegistry,
  buildSummary,
  readPublicSiteUrl,
  ROOT,
  type RegistrySummaryItem,
} from "../build-registry.ts";

describe("registry summary counts", () => {
  const baseUrl = readPublicSiteUrl(ROOT);
  const result = buildPortfolioRegistry({ baseUrl });
  const summary = JSON.parse(buildSummary(result)) as { items: RegistrySummaryItem[] };

  test("own and helper counts add up to the item JSON file count", () => {
    expect(summary.items.length).toBe(result.items.size);
    for (const entry of summary.items) {
      const json = result.items.get(entry.name);
      expect(json).toBeDefined();
      expect(entry.ownFileCount + entry.helperFileCount).toBe(json?.files.length ?? -1);
    }
  });

  test("helper count equals the files installed under the item's namespace", () => {
    for (const entry of summary.items) {
      const json = result.items.get(entry.name);
      const helpers = (json?.files ?? []).filter((file) =>
        file.target.startsWith(`@components/huanngdev/${entry.name}/`),
      );
      expect(entry.helperFileCount).toBe(helpers.length);
      expect(entry.helperDirectory === null).toBe(helpers.length === 0);
    }
  });

  test("items without helpers report zero helper files", () => {
    const plain = summary.items.find((entry) => entry.name === "audio-player");
    expect(plain?.helperFileCount).toBe(0);
    expect(plain?.helperDirectory).toBeNull();
  });
});
