import { describe, expect, test } from "bun:test";

import { BLOCK_LIST } from "@repo/core/components/layouts/blocks-section";
import { COMPONENT_LIST } from "@repo/core/components/layouts/components-section";

import { COMPONENT_DOCS } from "../../content/component-docs";

import {
  getInstallCommand,
  getItemDocs,
  getItemSource,
  searchItems,
  type SourceSliceResult,
} from "./catalog";
import { readRegistryIndex, readRegistryItem } from "./registry-source";

const indexNames = readRegistryIndex().map((item) => item.name);

describe("registry coverage", () => {
  test("every component and block on the site has a registry item", () => {
    for (const component of COMPONENT_LIST) {
      expect(indexNames).toContain(component.slug);
    }
    for (const block of BLOCK_LIST) {
      expect(indexNames).toContain(block.slug);
    }
  });

  test("component slugs and COMPONENT_DOCS keys are the same set", () => {
    const listed = COMPONENT_LIST.map((component) => component.slug).sort();
    const documented = Object.keys(COMPONENT_DOCS).sort();
    expect(documented).toEqual(listed);
  });

  test("every registry item JSON reads and validates", () => {
    for (const name of indexNames) {
      expect(readRegistryItem(name)?.name).toBe(name);
    }
  });

  test("names that are not index entries never reach the filesystem", () => {
    expect(readRegistryItem("../x")).toBeUndefined();
    expect(readRegistryItem("registry")).toBeUndefined();
  });
});

describe("searchItems", () => {
  test("empty query returns every item in index order", () => {
    const result = searchItems({ limit: 50 });
    expect(result.total).toBe(indexNames.length);
    expect(result.items.map((item) => item.name)).toEqual(indexNames);
    expect(result.hasMore).toBe(false);
    expect(result.nextOffset).toBeNull();
  });

  test("ocean ranks ascii-ocean first", () => {
    expect(searchItems({ query: "ocean" }).items[0]?.name).toBe("ascii-ocean");
  });

  test("intent words find a component by keyword", () => {
    const result = searchItems({ query: "animated background" });
    expect(result.items[0]?.name).toBe("ascii-ocean");
    expect(result.note).toBeUndefined();
  });

  test("a query with no match returns every item with a note", () => {
    const result = searchItems({ query: "zzzz", limit: 50 });
    expect(result.total).toBe(indexNames.length);
    expect(result.items.map((item) => item.name)).toEqual(indexNames);
    expect(result.note).toBe('No direct match for "zzzz"; showing every item instead.');
  });

  test("a keyword phrase finds a block", () => {
    expect(searchItems({ query: "rich text" }).items[0]?.name).toBe("notion-like-editor");
  });

  test("every component docs entry has at least four keywords", () => {
    for (const [slug, docs] of Object.entries(COMPONENT_DOCS)) {
      expect(docs.keywords.length, slug).toBeGreaterThanOrEqual(4);
    }
  });

  test("type filter returns only blocks", () => {
    const result = searchItems({ type: "block" });
    expect(result.total).toBe(BLOCK_LIST.length);
    expect(result.items.every((item) => item.type === "block")).toBe(true);
  });

  test("pagination reports hasMore and nextOffset", () => {
    const first = searchItems({ limit: 5, offset: 0 });
    expect(first.items).toHaveLength(5);
    expect(first.hasMore).toBe(true);
    expect(first.nextOffset).toBe(5);

    const last = searchItems({ limit: 5, offset: 10 });
    expect(last.items).toHaveLength(indexNames.length - 10);
    expect(last.hasMore).toBe(false);
    expect(last.nextOffset).toBeNull();
  });

  test("limit is clamped to at least 1", () => {
    expect(searchItems({ limit: 0 }).items).toHaveLength(1);
    expect(searchItems({ limit: -5 }).items).toHaveLength(1);
  });

  test("docsUrl points at the component or block page", () => {
    const all = searchItems({ limit: 50 }).items;
    expect(all.find((item) => item.name === "ascii-ocean")?.docsUrl).toBe(
      "https://www.huanngdev.site/components/ascii-ocean",
    );
    expect(all.find((item) => item.name === "error-page")?.docsUrl).toBe(
      "https://www.huanngdev.site/blocks/error-page",
    );
  });
});

describe("getItemDocs", () => {
  test("ascii-ocean has a props table with sharks", () => {
    const result = getItemDocs("ascii-ocean");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.markdown).toContain("## Props");
    expect(result.markdown).toContain("| sharks |");
    expect(result.markdown).toContain(
      "npx shadcn@latest add https://www.huanngdev.site/r/ascii-ocean.json",
    );
  });

  test("blocks list their files and have no Props section", () => {
    const result = getItemDocs("notion-like-editor");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.markdown).toContain("## Files");
    expect(result.markdown).not.toContain("## Props");
  });

  test("unknown name errors and points at search_components", () => {
    const result = getItemDocs("nope");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("search_components");
  });
});

describe("getItemSource", () => {
  test("lists the files of notion-like-editor without the registry prefix", () => {
    const result = getItemSource({ name: "notion-like-editor" });
    expect(result.ok).toBe(true);
    if (!result.ok || !("files" in result)) return;
    expect(result.files.length).toBeGreaterThan(0);
    for (const file of result.files) {
      expect(file.file.startsWith("registry/")).toBe(false);
      expect(file.lines).toBeGreaterThan(0);
    }
  });

  test("paging a large file returns at most maxLines and a correct nextStartLine", () => {
    const listing = getItemSource({ name: "notion-like-editor" });
    if (!listing.ok || !("files" in listing)) throw new Error("listing failed");
    const largest = [...listing.files].sort((a, b) => b.lines - a.lines)[0];
    if (largest === undefined) throw new Error("no files");

    const maxLines = 50;
    let startLine = 1;
    let collected = 0;
    let pages = 0;
    for (;;) {
      const page = getItemSource({
        name: "notion-like-editor",
        file: largest.file,
        startLine,
        maxLines,
      });
      if (!page.ok || "files" in page) throw new Error("page failed");
      const slice: SourceSliceResult = page;
      const pageLines = slice.endLine - slice.startLine + 1;
      expect(pageLines).toBeLessThanOrEqual(maxLines);
      expect(slice.totalLines).toBe(largest.lines);
      collected += pageLines;
      pages += 1;
      if (!slice.hasMore) {
        expect(slice.nextStartLine).toBeNull();
        break;
      }
      expect(slice.nextStartLine).toBe(slice.endLine + 1);
      startLine = slice.nextStartLine ?? startLine;
      if (pages > 1000) throw new Error("paging did not terminate");
    }
    expect(collected).toBe(largest.lines);
    expect(largest.lines).toBeGreaterThan(maxLines);
  });

  test("unknown file lists the valid files", () => {
    const result = getItemSource({ name: "ascii-ocean", file: "missing.ts" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("engine.ts");
  });

  test("traversal names are rejected", () => {
    const result = getItemSource({ name: "../x" });
    expect(result.ok).toBe(false);
  });
});

describe("getInstallCommand", () => {
  test("npm url form matches the site's CliCommand output", () => {
    const result = getInstallCommand({ names: ["ascii-ocean"] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.command).toBe(
      "npx shadcn@latest add https://www.huanngdev.site/r/ascii-ocean.json",
    );
    expect(result.commands.pnpm).toBe(
      "pnpm dlx shadcn@latest add https://www.huanngdev.site/r/ascii-ocean.json",
    );
    expect(result.packageManager).toBe("npm");
    expect(result.form).toBe("url");
    expect(result.namespaceConfig).toBeNull();
  });

  test("bun namespace form uses the namespace and returns the components.json snippet", () => {
    const result = getInstallCommand({
      names: ["ascii-ocean"],
      packageManager: "bun",
      form: "namespace",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.command).toContain("@huanngdev/ascii-ocean");
    expect(result.command).toBe("bunx --bun shadcn@latest add @huanngdev/ascii-ocean");
    expect(result.namespaceConfig).toContain("@huanngdev");
  });

  test("duplicate names are deduped", () => {
    const result = getInstallCommand({ names: ["ascii-ocean", "ascii-ocean"] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.items).toHaveLength(1);
  });

  test("unknown name errors with a search_components hint", () => {
    const result = getInstallCommand({ names: ["ascii-ocen"] });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("ascii-ocen");
    expect(result.error).toContain("Did you mean: ascii-ocean?");
    expect(result.error).toContain("search_components");
  });
});
