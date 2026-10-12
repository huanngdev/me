import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.join(import.meta.dir, "..");

describe("export entry", () => {
  test("the static import graph stays free of client editor code", () => {
    const seen = new Set<string>();
    const forbidden = [
      "components/ui/",
      "/hooks/",
      "/lib/plugins/",
      "/lib/commands/",
      "/lib/paste/",
      "/components/elements/",
    ];
    const visit = (file: string): void => {
      const absolute = path.resolve(file);
      if (seen.has(absolute) || (!absolute.endsWith(".ts") && !absolute.endsWith(".tsx"))) {
        return;
      }

      seen.add(absolute);
      const source = readFileSync(absolute, "utf8");
      expect(source).not.toContain('"use client"');
      expect(source).not.toContain("platejs/react");
      expect(source).not.toContain("react-dom");
      const specifiers = [...source.matchAll(/from\s+["'](\.[^"']+)["']/g)].map(
        (match) => match[1] ?? "",
      );
      for (const specifier of specifiers) {
        const resolved = path.resolve(path.dirname(absolute), specifier);
        const withExt = [resolved, `${resolved}.ts`, `${resolved}.tsx`].find((candidate) => {
          try {
            readFileSync(candidate);
            return true;
          } catch {
            return false;
          }
        });
        if (!withExt) {
          continue;
        }

        const relative = withExt.slice(ROOT.length);
        for (const folder of forbidden) {
          if (relative.includes(folder)) {
            throw new Error(`${relative} is under ${folder}`);
          }
        }

        visit(withExt);
      }
    };

    visit(path.join(ROOT, "lib/io/export-document.ts"));
    expect(seen.size).toBeGreaterThan(3);
  });
});
