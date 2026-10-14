import { describe, expect, test } from "bun:test";

import { isPackageManager, resolveCommands } from "../package-managers";

describe("resolveCommands", () => {
  test("installs packages with each manager's verb", () => {
    expect(resolveCommands({ install: "lucide-react" })).toEqual({
      npm: "npm install lucide-react",
      pnpm: "pnpm add lucide-react",
      yarn: "yarn add lucide-react",
      bun: "bun add lucide-react",
    });
  });

  test("puts the dev flag right after the verb", () => {
    expect(resolveCommands({ install: "typescript", dev: true })).toEqual({
      npm: "npm install -D typescript",
      pnpm: "pnpm add -D typescript",
      yarn: "yarn add -D typescript",
      bun: "bun add -D typescript",
    });
  });

  test("runs a package binary through each manager's executor", () => {
    expect(resolveCommands({ execute: "shadcn@latest add button" })).toEqual({
      npm: "npx shadcn@latest add button",
      pnpm: "pnpm dlx shadcn@latest add button",
      yarn: "yarn dlx shadcn@latest add button",
      bun: "bunx --bun shadcn@latest add button",
    });
  });

  test("runs a package script through each manager's runner", () => {
    expect(resolveCommands({ run: "build" })).toEqual({
      npm: "npm run build",
      pnpm: "pnpm build",
      yarn: "yarn build",
      bun: "bun run build",
    });
  });

  test("returns explicit per-manager commands as given", () => {
    const commands = { npm: "npx a", pnpm: "pnpm a", yarn: "yarn a", bun: "bunx --bun a" };

    expect(resolveCommands({ commands })).toEqual(commands);
  });

  test("trims the input and collapses inner whitespace to one space", () => {
    expect(resolveCommands({ install: "  three \t @react-three/fiber  " }).bun).toBe(
      "bun add three @react-three/fiber",
    );
  });

  test("keeps the lines of a multi-line command", () => {
    expect(resolveCommands({ install: "  a   b \n  c   d  " }).bun).toBe("bun add a b\nc d");
  });

  test("leaves the verb alone when there is nothing to add", () => {
    expect(resolveCommands({ install: "  " }).npm).toBe("npm install");
  });
});

describe("isPackageManager", () => {
  test("accepts only the four known managers", () => {
    expect(isPackageManager("bun")).toBe(true);
    expect(isPackageManager("pnpm")).toBe(true);
    expect(isPackageManager("cargo")).toBe(false);
    expect(isPackageManager(null)).toBe(false);
  });
});
