import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, test } from "bun:test";

const editorRoot = join(import.meta.dir, "..");

function sourceFiles(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__tests__") {
        continue;
      }
      found.push(...sourceFiles(path));
      continue;
    }
    if (entry.name.endsWith(".tsx")) {
      found.push(path);
    }
  }
  return found;
}

describe("editor button rules", () => {
  test("controls use the app button, and destructive actions remove something", () => {
    const problems: string[] = [];

    for (const path of sourceFiles(editorRoot)) {
      const text = readFileSync(path, "utf8");
      const name = relative(editorRoot, path);

      if (text.includes("<button")) {
        problems.push(`${name} contains a raw button element`);
      }

      for (const match of text.matchAll(/size="([^"]+)"/g)) {
        const size = match[1];
        if (size !== "sm" && size !== "icon") {
          problems.push(`${name} passes size ${size ?? ""}`);
        }
      }

      if (text.includes('"icon-sm"') || text.includes('"icon-xs"') || text.includes('"icon-lg"')) {
        problems.push(`${name} uses an icon size other than icon`);
      }

      for (const match of text.matchAll(/variant="destructive"/g)) {
        const start = match.index ?? 0;
        const around = text.slice(Math.max(0, start - 240), start + 320);
        if (!/remove|delete|unlink/i.test(around)) {
          problems.push(`${name} uses destructive outside a remove action`);
        }
      }
    }

    expect(problems).toEqual([]);
  });
});
