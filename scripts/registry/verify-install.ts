/**
 * Manual install matrix. Not part of CI: it needs the network and several minutes.
 *
 *   bun scripts/registry/verify-install.ts [--items a,b] [--configs c,d] [--primitives present|absent] [--latest] [--keep]
 *
 * `--primitives present` (default) gives the user stock button and tooltip with a sentinel line.
 * `--primitives absent` leaves them out, so the items' own install and build can be checked.
 *
 * The registry is built into a temp dir (apps/web/public/r is never touched) and served on
 * 127.0.0.1. For each config a base project is created under the OS temp dir and given user
 * files (sentinel content). Each item then gets its own clone of that base, and each cell runs:
 *
 *   1. shadcn add <item url>        fails if the CLI changed a file that existed before, or a sentinel
 *   2. tsc                          a probe imports the item's entry points
 *   3. build                        Next: the smoke page is prerendered (runtime render)
 *   4. shadcn add again             must leave `git status` clean
 *
 * Cell statuses: ok, add failed, tsc failed (n errors), build failed, render failed,
 * not idempotent, n/a (Next.js only), skipped.
 */

import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildPortfolioRegistry, writeRegistry } from "./build-registry.ts";
import { ITEMS } from "./items.ts";
import { fileRole, ownedTarget } from "./lib/targets.ts";
import { SHADCN_PRIMITIVES } from "./primitives.ts";
import { SMOKE, smokeModuleSource } from "./smoke.ts";
import { PINNED_VERSIONS } from "./versions.ts";

const OFFICIAL_STYLE = "radix-nova";
const OFFICIAL_REGISTRY = `https://ui.shadcn.com/r/styles/${OFFICIAL_STYLE}`;

type ToolName = keyof typeof PINNED_VERSIONS;

type Pm = "bun" | "npm" | "pnpm";

type Aliases = {
  components: string;
  ui: string;
  lib: string;
  hooks: string;
  utils: string;
};

type ConfigDef = {
  name: string;
  framework: "next" | "vite";
  pm: Pm;
  /** Next only: `src/` directory or project root. */
  srcDir: boolean;
  preset: string;
  base: string;
  /** Overrides the style written by init (for example `new-york-v4`). */
  styleOverride?: string;
  aliases: Aliases;
  tscArgs: string[];
  /** Items to run when `--items` is not given. */
  defaultItems?: readonly string[];
  note: string;
};

const NEXT_ALIASES: Aliases = {
  components: "@/components",
  ui: "@/components/ui",
  lib: "@/lib",
  hooks: "@/hooks",
  utils: "@/lib/utils",
};

const VITE_ALIASES: Aliases = {
  components: "~/shared/components",
  ui: "~/shared/components/ui",
  lib: "~/shared/lib",
  hooks: "~/shared/hooks",
  utils: "~/shared/utils",
};

const THREE_ITEMS = ["shadcn-tags-input", "audio-player", "notion-like-editor"] as const;

export const CONFIGS: Readonly<Record<string, ConfigDef>> = {
  "next-src": {
    name: "next-src",
    framework: "next",
    pm: "bun",
    srcDir: true,
    preset: "nova",
    base: "radix",
    aliases: NEXT_ALIASES,
    tscArgs: ["--noEmit"],
    note: "create-next-app with src/, shadcn radix-nova",
  },
  "next-nosrc-newyork": {
    name: "next-nosrc-newyork",
    framework: "next",
    pm: "bun",
    srcDir: false,
    preset: "nova",
    base: "radix",
    styleOverride: "new-york-v4",
    aliases: NEXT_ALIASES,
    tscArgs: ["--noEmit"],
    note: "create-next-app without src/, shadcn style new-york-v4 (set in components.json)",
  },
  "next-src-base": {
    name: "next-src-base",
    framework: "next",
    pm: "bun",
    srcDir: true,
    preset: "nova",
    base: "base",
    aliases: NEXT_ALIASES,
    tscArgs: ["--noEmit"],
    note: "create-next-app with src/, shadcn Base UI (--base base --preset nova)",
  },
  "vite-alias": {
    name: "vite-alias",
    framework: "vite",
    pm: "bun",
    srcDir: true,
    preset: "nova",
    base: "radix",
    aliases: VITE_ALIASES,
    tscArgs: ["--noEmit", "-p", "tsconfig.app.json"],
    note: "Vite react-ts with custom ~/shared aliases",
  },
  "next-src-npm": {
    name: "next-src-npm",
    framework: "next",
    pm: "npm",
    srcDir: true,
    preset: "nova",
    base: "radix",
    aliases: NEXT_ALIASES,
    tscArgs: ["--noEmit"],
    defaultItems: THREE_ITEMS,
    note: "next-src with npm and npx shadcn",
  },
  "next-src-pnpm": {
    name: "next-src-pnpm",
    framework: "next",
    pm: "pnpm",
    srcDir: true,
    preset: "nova",
    base: "radix",
    aliases: NEXT_ALIASES,
    tscArgs: ["--noEmit"],
    defaultItems: THREE_ITEMS,
    note: "next-src with pnpm and pnpm dlx shadcn",
  },
};

type CommandResult = { code: number; output: string };

/**
 * Every process we start runs in its own process group (a perl `setpgrp` wrapper), so one
 * `kill(-pid)` also stops the CLI's own children. Groups are killed on timeout, when a run
 * finishes with members left over, and on exit or a signal to this script. A pty child started
 * by `expect` has its own session, so its pid is written to a pid file and killed the same way.
 */
const liveGroups = new Set<number>();
const pidFiles = new Set<string>();
const SETPGRP = ["perl", "-e", "setpgrp(0,0) or die; exec { $ARGV[0] } @ARGV"];

function groupAlive(pid: number): boolean {
  try {
    process.kill(-pid, 0);
    return true;
  } catch {
    return false;
  }
}

function signalGroup(pid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(-pid, signal);
  } catch {
    // the group is already gone
  }
}

/** SIGTERM, a short grace for clean shutdown, then SIGKILL. */
async function killGroup(pid: number, graceMs = 2000): Promise<void> {
  if (!groupAlive(pid)) return;
  signalGroup(pid, "SIGTERM");
  await Bun.sleep(graceMs);
  signalGroup(pid, "SIGKILL");
}

/** Synchronous, for the exit handler and signals: nothing of ours may survive the script. */
function killEverythingNow(): void {
  for (const pid of liveGroups) signalGroup(pid, "SIGKILL");
  liveGroups.clear();
  for (const file of pidFiles) {
    try {
      signalGroup(Number(readFileSync(file, "utf8").trim()), "SIGKILL");
    } catch {
      // no pid file, or the process already exited
    }
  }
  pidFiles.clear();
}

process.on("exit", killEverythingNow);
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
  process.on(signal, () => {
    killEverythingNow();
    process.exit(130);
  });
}

export async function run(
  command: string[],
  cwd: string,
  options: { timeoutMs?: number } = {},
): Promise<CommandResult> {
  const child = Bun.spawn([...SETPGRP, ...command], {
    cwd,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, CI: "1", NO_COLOR: "1", FORCE_COLOR: "0" },
  });
  const pid = child.pid;
  liveGroups.add(pid);
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    void killGroup(pid);
  }, options.timeoutMs ?? 900_000);
  try {
    const [stdout, stderr, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    return {
      code: timedOut ? 124 : code,
      output: `${stdout}\n${stderr}${timedOut ? "\nTIMEOUT: process group killed" : ""}`,
    };
  } finally {
    clearTimeout(timer);
    await killGroup(pid);
    liveGroups.delete(pid);
  }
}

function firstLines(output: string, pattern: RegExp, limit: number): string {
  const lines = output.split("\n").filter((line) => pattern.test(line));
  const picked = lines.length > 0 ? lines : output.split("\n").filter((line) => line.trim() !== "");
  return picked
    .slice(0, limit)
    .map((line) => `      ${line.trimEnd()}`)
    .join("\n");
}

let toolVersions: Record<ToolName, string> = { ...PINNED_VERSIONS };

function toolSpec(tool: ToolName): string {
  return `${tool}@${toolVersions[tool]}`;
}

/** Runs a package's bin without installing it into the project (bunx / npx / pnpm dlx). */
function dlx(pm: Pm, spec: string, args: string[]): string[] {
  if (pm === "bun") return ["bunx", "--bun", spec, ...args];
  if (pm === "npm") return ["npx", "--yes", spec, ...args];
  return ["pnpm", "dlx", spec, ...args];
}

/** Runs a binary installed in the project. */
function projectBin(pm: Pm, bin: string, args: string[]): string[] {
  if (pm === "bun") return ["bunx", "--bun", bin, ...args];
  if (pm === "npm") return ["npx", bin, ...args];
  return ["pnpm", "exec", bin, ...args];
}

function install(pm: Pm, packages: string[]): string[] {
  return [pm, pm === "npm" ? "install" : "add", ...packages];
}

function scriptCommand(pm: Pm, script: string): string[] {
  return [pm, "run", script];
}

function aliasDir(config: ConfigDef, alias: string): string {
  if (alias.startsWith("@/")) return `${config.srcDir ? "src/" : ""}${alias.slice(2)}`;
  if (alias.startsWith("~/")) return `src/${alias.slice(2)}`;
  throw new Error(`unsupported alias ${alias}`);
}

const SKIP_DIRS = new Set(["node_modules", ".git", ".next", "dist"]);

function hashFile(absolute: string): string {
  return createHash("sha256").update(readFileSync(absolute)).digest("hex");
}

function snapshot(
  root: string,
  current = root,
  into = new Map<string, string>(),
): Map<string, string> {
  for (const entry of readdirSync(current)) {
    if (SKIP_DIRS.has(entry)) continue;
    const absolute = join(current, entry);
    if (statSync(absolute).isDirectory()) {
      snapshot(root, absolute, into);
    } else {
      into.set(absolute.slice(root.length + 1), hashFile(absolute));
    }
  }
  return into;
}

/** Files the CLI is expected to merge into rather than replace. */
const MERGE_TARGETS: ReadonlySet<string> = new Set([
  "package.json",
  "bun.lock",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
]);

const SENTINEL = "// registry-test: user file, must survive shadcn add";

export async function verifyPrimitives(): Promise<string[]> {
  const failures: string[] = [];
  await Promise.all(
    SHADCN_PRIMITIVES.map(async (name) => {
      const response = await fetch(`${OFFICIAL_REGISTRY}/${name}.json`);
      if (!response.ok) {
        failures.push(`${name}: HTTP ${response.status}`);
        return;
      }
      const body = (await response.json()) as { type?: string };
      if (body.type !== "registry:ui") {
        failures.push(`${name}: type is ${String(body.type)}, expected registry:ui`);
      }
    }),
  );
  return failures.sort();
}

async function mustRun(command: string[], cwd: string, what: string): Promise<void> {
  const result = await run(command, cwd);
  if (result.code !== 0) {
    throw new Error(`${what} failed:\n${firstLines(result.output, /./, 12)}`);
  }
}

async function setupBase(root: string, config: ConfigDef, primitives: boolean): Promise<string> {
  const project = join(root, "app");
  const pmFlag = { bun: "--use-bun", npm: "--use-npm", pnpm: "--use-pnpm" }[config.pm];
  if (config.framework === "next") {
    const args = [
      "app",
      "--ts",
      "--tailwind",
      "--app",
      "--import-alias",
      "@/*",
      pmFlag,
      "--disable-git",
      "--yes",
      "--no-agent-feedback",
    ];
    if (config.srcDir) args.splice(4, 0, "--src-dir");
    await mustRun(dlx(config.pm, toolSpec("create-next-app"), args), root, "create-next-app");
  } else {
    await mustRun(
      dlx(config.pm, toolSpec("create-vite"), [
        "app",
        "--template",
        "react-ts",
        "--no-interactive",
      ]),
      root,
      "create-vite",
    );
    await mustRun(
      install(config.pm, ["tailwindcss@^4", "@tailwindcss/vite@^4"]),
      project,
      "install tailwind",
    );
    await setupViteFiles(project, config);
  }

  await mustRun(
    dlx(config.pm, toolSpec("shadcn"), [
      "init",
      "--yes",
      "--preset",
      config.preset,
      "--base",
      config.base,
      "--template",
      config.framework,
      "--no-monorepo",
      "--silent",
    ]),
    project,
    `shadcn init (${config.name})`,
  );

  const componentsPath = join(project, "components.json");
  const components = JSON.parse(readFileSync(componentsPath, "utf8")) as Record<string, unknown>;
  if (config.framework === "vite") {
    components.aliases = config.aliases;
    components.tailwind = { ...(components.tailwind as object), css: "src/index.css" };
  }
  if (config.styleOverride !== undefined) {
    components.style = config.styleOverride;
  }
  writeFileSync(componentsPath, `${JSON.stringify(components, null, 2)}\n`);
  if (config.styleOverride !== undefined) {
    // init wrote button.tsx in the preset's style. A user on this style has the style's own button,
    // so swap it for the official one; otherwise the CLI asks to overwrite it on every item.
    rmSync(join(project, aliasDir(config, config.aliases.ui), "button.tsx"), { force: true });
    await mustRun(
      dlx(config.pm, toolSpec("shadcn"), ["add", "button", "--yes"]),
      project,
      `shadcn add button (${config.styleOverride})`,
    );
  }

  if (config.framework === "vite") {
    // init ran before the custom aliases existed, so it wrote no utils file. Create the standard
    // shadcn `cn` helper where the `utils` alias points, exactly as init would have.
    await mustRun(
      install(config.pm, ["clsx", "tailwind-merge"]),
      project,
      "install clsx and tailwind-merge",
    );
    const utilsFile = `${aliasDir(config, config.aliases.utils)}.ts`;
    mkdirSync(dirname(join(project, utilsFile)), { recursive: true });
    writeFileSync(
      join(project, utilsFile),
      [
        'import { clsx, type ClassValue } from "clsx";',
        'import { twMerge } from "tailwind-merge";',
        "",
        "export function cn(...inputs: ClassValue[]) {",
        "  return twMerge(clsx(inputs));",
        "}",
        "",
      ].join("\n"),
    );
  }

  await addUserFiles(project, config, primitives);
  const commit = await run(
    [
      "sh",
      "-c",
      "git init -q && git add -A && git -c user.name=registry-test -c user.email=registry-test@example.invalid commit -qm base",
    ],
    project,
  );
  if (commit.code !== 0) {
    throw new Error(`git init failed:\n${firstLines(commit.output, /./, 6)}`);
  }
  return project;
}

async function setupViteFiles(project: string, config: ConfigDef): Promise<void> {
  mkdirSync(join(project, "src"), { recursive: true });
  writeFileSync(
    join(project, "vite.config.ts"),
    [
      'import tailwindcss from "@tailwindcss/vite";',
      'import react from "@vitejs/plugin-react";',
      'import { fileURLToPath, URL } from "node:url";',
      'import { defineConfig } from "vite";',
      "",
      "export default defineConfig({",
      "  plugins: [react(), tailwindcss()],",
      '  resolve: { alias: { "~": fileURLToPath(new URL("./src", import.meta.url)) } },',
      "});",
      "",
    ].join("\n"),
  );
  // The CLI resolves aliases from the root tsconfig.json, which in the Vite template only has references.
  const rootTsconfigPath = join(project, "tsconfig.json");
  const rootTsconfig = JSON.parse(readFileSync(rootTsconfigPath, "utf8")) as Record<
    string,
    unknown
  >;
  rootTsconfig.compilerOptions = { paths: { "~/*": ["./src/*"] } };
  writeFileSync(rootTsconfigPath, `${JSON.stringify(rootTsconfig, null, 2)}\n`);
  const tsconfigPath = join(project, "tsconfig.app.json");
  const tsconfig = readFileSync(tsconfigPath, "utf8");
  if (!tsconfig.includes('"noEmit": true,')) {
    throw new Error("tsconfig.app.json layout changed; cannot add the ~ path");
  }
  writeFileSync(
    tsconfigPath,
    tsconfig.replace('"noEmit": true,', '"noEmit": true,\n    "paths": { "~/*": ["./src/*"] },'),
  );
  writeFileSync(join(project, "src/index.css"), '@import "tailwindcss";\n');
  void config;
}

/**
 * Files a user already has. Two primitives the items depend on (with a sentinel line) and two
 * helper files whose names the items' own copies used to take (sentinel bodies).
 */
function userFilesOf(
  config: ConfigDef,
  primitives: boolean,
): { relative: string; content: string; sentinelled: boolean }[] {
  const ui = aliasDir(config, config.aliases.ui);
  const components = aliasDir(config, config.aliases.components);
  const lib = aliasDir(config, config.aliases.lib);
  const helpers = [
    {
      relative: `${components}/copy-button.tsx`,
      content: `${SENTINEL}\nexport const userCopyButton = true;\n`,
      sentinelled: true,
    },
    {
      relative: `${lib}/sound-engine.ts`,
      content: `${SENTINEL}\nexport const userSoundEngine = true;\n`,
      sentinelled: true,
    },
  ];
  if (!primitives) return helpers;
  return [
    { relative: `${ui}/button.tsx`, content: `${SENTINEL}\n`, sentinelled: true },
    { relative: `${ui}/tooltip.tsx`, content: `${SENTINEL}\n`, sentinelled: true },
    ...helpers,
  ];
}

async function addUserFiles(
  project: string,
  config: ConfigDef,
  primitives: boolean,
): Promise<void> {
  if (primitives) {
    // Stock primitives come from the official registry, then get a sentinel first line.
    await mustRun(
      dlx(config.pm, toolSpec("shadcn"), ["add", "button", "tooltip", "--yes"]),
      project,
      "shadcn add button tooltip (user primitives)",
    );
  }
  for (const file of userFilesOf(config, primitives)) {
    const absolute = join(project, file.relative);
    mkdirSync(dirname(absolute), { recursive: true });
    if (file.sentinelled && existsSync(absolute)) {
      writeFileSync(absolute, `${SENTINEL}\n${readFileSync(absolute, "utf8")}`);
    } else {
      writeFileSync(absolute, file.content);
    }
  }
}

function cloneProject(base: string, destination: string): void {
  cpSync(base, destination, { recursive: true, verbatimSymlinks: true });
}

function targetToProjectPath(config: ConfigDef, target: string): string {
  const match = /^@(components|hooks|lib)\/(.+)$/.exec(target);
  if (match === null || match[1] === undefined || match[2] === undefined) {
    throw new Error(`unexpected target ${target}`);
  }
  const alias = config.aliases[match[1] as "components" | "hooks" | "lib"];
  return `${aliasDir(config, alias)}/${match[2]}`;
}

function importSpecifierFor(config: ConfigDef, target: string): string {
  const match = /^@(components|hooks|lib)\/(.+)$/.exec(target);
  if (match === null || match[1] === undefined || match[2] === undefined) {
    throw new Error(`unexpected target ${target}`);
  }
  const alias = config.aliases[match[1] as "components" | "hooks" | "lib"];
  return `${alias}/${match[2].replace(/\.tsx?$/, "")}`;
}

/** Targets of an item's public entry points, as the registry installs them. */
function entryTargetsOf(itemName: string): string[] {
  const item = ITEMS.find((candidate) => candidate.name === itemName);
  if (item === undefined) {
    throw new Error(`unknown item ${itemName}`);
  }
  return item.entries.map((entry) => {
    const relative = entry.replace(/^packages\/core\/src\//, "");
    return fileRole(relative).type === "registry:hook"
      ? `@hooks/${relative}`
      : ownedTarget(item, relative);
  });
}

/**
 * Probe: a layout import (server) for every entry, so the entries are compiled in the real module
 * graph. For Next, also a smoke page that server-renders each main component.
 */
function writeProbe(project: string, config: ConfigDef, itemName: string): void {
  const targets = entryTargetsOf(itemName);
  const aliasRoot = config.framework === "next" ? "@" : "~";
  const probeFile = `${config.srcDir || config.framework === "vite" ? "src/" : ""}registry-probe.ts`;
  const imports = targets.map(
    (target, index) => `import * as probe${index} from "${importSpecifierFor(config, target)}";`,
  );
  const list = targets.map((_, index) => `probe${index}`).join(", ");
  mkdirSync(dirname(join(project, probeFile)), { recursive: true });
  writeFileSync(
    join(project, probeFile),
    `// Generated by verify-install.ts: imports the item's public entry points, as a host app would.\n${imports.join("\n")}\nexport const probes = [${list}];\n`,
  );

  const appDir = config.framework === "next" ? (config.srcDir ? "src/app" : "app") : "src";
  const entry = config.framework === "next" ? `${appDir}/layout.tsx` : "src/main.tsx";
  const entryPath = join(project, entry);
  writeFileSync(
    entryPath,
    `import "${aliasRoot}/registry-probe";\n${readFileSync(entryPath, "utf8")}`,
  );

  if (config.framework === "next") {
    const parts = SMOKE[itemName];
    if (parts === undefined) {
      throw new Error(`no smoke render defined for ${itemName}`);
    }
    const smokeRoot = config.srcDir ? "src/" : "";
    writeFileSync(
      join(project, `${smokeRoot}registry-smoke.tsx`),
      smokeModuleSource(parts, config.aliases.components),
    );
    mkdirSync(join(project, appDir, "registry-smoke"), { recursive: true });
    writeFileSync(
      join(project, appDir, "registry-smoke", "page.tsx"),
      'import { RegistrySmoke } from "@/registry-smoke";\n\nexport default function Page() {\n  return <RegistrySmoke />;\n}\n',
    );
  }
}

type Cell = { status: string; detail: string };

async function runCell(
  base: string,
  scratch: string,
  config: ConfigDef,
  itemName: string,
  url: string,
  targets: string[],
  keep: boolean,
  primitives: boolean,
): Promise<Cell> {
  const project = join(scratch, `${config.name}-${itemName}`);
  cloneProject(base, project);
  const pm = config.pm;
  try {
    const before = snapshot(project);
    const texts = new Map<string, string>();
    for (const file of MERGE_TARGETS) {
      if (existsSync(join(project, file)))
        texts.set(file, readFileSync(join(project, file), "utf8"));
    }
    const cssFile =
      (
        JSON.parse(readFileSync(join(project, "components.json"), "utf8")) as {
          tailwind?: { css?: string };
        }
      ).tailwind?.css ?? "src/app/globals.css";
    if (existsSync(join(project, cssFile)))
      texts.set(cssFile, readFileSync(join(project, cssFile), "utf8"));
    const userFiles = userFilesOf(config, primitives);
    const userBefore = new Map(
      userFiles.map((file) => [file.relative, readFileSync(join(project, file.relative), "utf8")]),
    );

    const add = await run(dlx(pm, toolSpec("shadcn"), ["add", url, "--yes"]), project);
    if (add.code !== 0) {
      return { status: "add failed", detail: firstLines(add.output, /error|fail|warn/i, 8) };
    }
    const prompt = /(\S+) already exists\. Would you like to overwrite/.exec(add.output);
    if (prompt !== null) {
      return {
        status: "needs answer (overwrite prompt)",
        detail: `      CLI asked "${prompt[1]} already exists. Would you like to overwrite?" with --yes; no answer was given, so the item was not installed (exit 0)`,
      };
    }

    const overwroteUser = userFiles.filter((file) => {
      const now = join(project, file.relative);
      return (
        !existsSync(now) ||
        readFileSync(now, "utf8") !== userBefore.get(file.relative) ||
        !readFileSync(now, "utf8").includes(SENTINEL)
      );
    });
    if (overwroteUser.length > 0) {
      return {
        status: "add failed",
        detail: `      user file overwritten or sentinel lost: ${overwroteUser.map((file) => file.relative).join(", ")}`,
      };
    }

    const overwritten = [...before.keys()].filter((file) => {
      if (MERGE_TARGETS.has(file) || file === cssFile) return false;
      const now = join(project, file);
      return !existsSync(now) || hashFile(now) !== before.get(file);
    });
    if (overwritten.length > 0) {
      return {
        status: "add failed",
        detail: `      CLI changed files that existed before: ${overwritten.join(", ")}`,
      };
    }

    const lost = mergeLosses(project, texts);
    if (lost.length > 0) {
      return {
        status: "add failed",
        detail: `      CLI dropped existing content:\n${lost.map((line) => `      ${line}`).join("\n")}`,
      };
    }

    const missing = targets.filter(
      (target) => !existsSync(join(project, targetToProjectPath(config, target))),
    );
    if (missing.length > 0) {
      return {
        status: "add failed",
        detail: `      missing after add: ${missing.length} of ${targets.length} files\n${firstLines(add.output, /./, 12)}`,
      };
    }

    writeProbe(project, config, itemName);
    await run(
      [
        "sh",
        "-c",
        "git add -A && git -c user.name=registry-test -c user.email=registry-test@example.invalid commit -qm item",
      ],
      project,
    );

    const tsc = await run(projectBin(pm, "tsc", config.tscArgs), project);
    if (tsc.code !== 0) {
      const count = tsc.output.split("\n").filter((line) => /error TS\d+/.test(line)).length;
      return {
        status: `tsc failed (${count} errors)`,
        detail: firstLines(tsc.output, /error TS\d+/, 6),
      };
    }

    const build = await run(scriptCommand(pm, "build"), project);
    if (build.code !== 0) {
      if (config.framework === "next" && /prerender|registry-smoke/i.test(build.output)) {
        return {
          status: "render failed",
          detail: firstLines(build.output, /error|Error|prerender/, 10),
        };
      }
      return {
        status: "build failed",
        detail: firstLines(build.output, /error|failed|✖|Error/, 8),
      };
    }

    const again = await run(dlx(pm, toolSpec("shadcn"), ["add", url, "--yes"]), project);
    if (again.code !== 0) {
      return {
        status: "not idempotent",
        detail: `      second add exited ${again.code}:\n${firstLines(again.output, /error|fail/i, 6)}`,
      };
    }
    const status = await run(["git", "status", "--porcelain"], project);
    if (status.output.trim() !== "") {
      return {
        status: "not idempotent",
        detail: `      second add changed:\n${status.output
          .trim()
          .split("\n")
          .slice(0, 8)
          .map((line) => `      ${line}`)
          .join("\n")}`,
      };
    }
    return { status: "ok", detail: "" };
  } finally {
    if (!keep) rmSync(project, { recursive: true, force: true });
  }
}

/** `CSS` and `package.json` may change, but nothing that existed may disappear. */
function mergeLosses(project: string, texts: Map<string, string>): string[] {
  const losses: string[] = [];
  const packageBefore = texts.get("package.json");
  if (packageBefore !== undefined) {
    const packageAfter = readFileSync(join(project, "package.json"), "utf8");
    if (!isJsonSubset(JSON.parse(packageBefore), JSON.parse(packageAfter))) {
      losses.push("package.json: an existing key or value was removed or changed");
    }
  }
  for (const [file, before] of texts) {
    if (file === "package.json" || MERGE_TARGETS.has(file)) continue;
    const after = new Set(
      readFileSync(join(project, file), "utf8")
        .split("\n")
        .map((line) => line.trim()),
    );
    for (const line of before.split("\n").map((entry) => entry.trim())) {
      if (line !== "" && !after.has(line)) losses.push(`${file}: ${line}`);
    }
  }
  return losses;
}

function isJsonSubset(before: unknown, after: unknown): boolean {
  if (typeof before !== "object" || before === null) return before === after;
  if (typeof after !== "object" || after === null || Array.isArray(before) !== Array.isArray(after))
    return false;
  return Object.entries(before as Record<string, unknown>).every(([key, value]) =>
    isJsonSubset(value, (after as Record<string, unknown>)[key]),
  );
}

export function parseArgs(argv: readonly string[]): {
  items: string[] | undefined;
  configs: string[];
  keep: boolean;
  latest: boolean;
  primitives: boolean;
  mode: "matrix" | "interactive-no";
} {
  const value = (flag: string): string[] | undefined => {
    const index = argv.indexOf(flag);
    if (index === -1) return undefined;
    const raw = argv[index + 1];
    if (raw === undefined) throw new Error(`${flag} needs a value`);
    return raw
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part !== "");
  };
  const items = value("--items");
  const configs = value("--configs") ?? Object.keys(CONFIGS);
  for (const name of items ?? []) {
    if (!ITEMS.some((item) => item.name === name)) throw new Error(`unknown item ${name}`);
  }
  for (const name of configs) {
    if (!(name in CONFIGS)) throw new Error(`unknown config ${name}`);
  }
  const mode = value("--primitives")?.[0] ?? "present";
  if (mode !== "present" && mode !== "absent")
    throw new Error("--primitives takes present or absent");
  const runMode = value("--mode")?.[0] ?? "matrix";
  if (runMode !== "matrix" && runMode !== "interactive-no")
    throw new Error("--mode takes matrix or interactive-no");
  return {
    items,
    configs,
    keep: argv.includes("--keep"),
    latest: argv.includes("--latest"),
    primitives: mode === "present",
    mode: runMode,
  };
}

async function commandAvailable(name: string): Promise<boolean> {
  const result = await run(["sh", "-c", `command -v ${name}`], process.cwd());
  return result.code === 0;
}

/**
 * `--mode interactive-no`: one item on next-src, answered through a real pseudo-terminal (expect).
 * The user's `button.tsx` keeps its own content with the sentinel line prepended, so the file still
 * compiles. The check passes only if the CLI keeps that file, installs the item and tsc passes.
 */
const EXPECT_SCRIPT = `set timeout 180
set stty_init "rows 40 cols 120"
cd [lindex $argv 0]
spawn bunx --bun shadcn@${PINNED_VERSIONS.shadcn} add [lindex $argv 1]
set pidfile [open [lindex $argv 2] w]
puts $pidfile [exp_pid]
close $pidfile
expect {
  -re {overwrite.*[(]y/N[)]} { send "n\\r"; exp_continue }
  timeout { puts "EXPECT_TIMEOUT"; catch {exec kill -9 [exp_pid]}; exit 124 }
  eof
}
catch wait result
exit [lindex $result 3]
`;

async function interactiveNoCheck(keep: boolean, latest: boolean): Promise<number> {
  if (!(await commandAvailable("expect"))) {
    console.log("interactive-no: skipped, expect is not on PATH");
    return 0;
  }
  if (latest) {
    toolVersions = { shadcn: "latest", "create-next-app": "latest", "create-vite": "latest" };
  }
  const config = CONFIGS["next-src"];
  const itemName = "audio-player";
  const outDir = mkdtempSync(join(tmpdir(), "registry-out-"));
  const scratch = mkdtempSync(join(tmpdir(), "registry-install-"));
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request: Request): Response {
      const path = new URL(request.url).pathname;
      const file = join(outDir, path.replace(/^\/r\//, ""));
      if (!path.startsWith("/r/") || !existsSync(file) || !statSync(file).isFile()) {
        return new Response("not found", { status: 404 });
      }
      return new Response(readFileSync(file), { headers: { "content-type": "application/json" } });
    },
  });
  const baseUrl = `http://127.0.0.1:${server.port}`;
  let cell: Cell = { status: "fail", detail: "" };
  try {
    const built = buildPortfolioRegistry({ baseUrl });
    writeRegistry(built, outDir);
    const item = built.items.get(itemName);
    if (item === undefined) throw new Error(`no generated item ${itemName}`);
    const root = mkdtempSync(join(scratch, "base-"));
    const base = await setupBase(root, config, true);
    const project = join(scratch, `interactive-no-${itemName}`);
    cloneProject(base, project);
    const expectPath = join(scratch, "answer-no.exp");
    writeFileSync(expectPath, EXPECT_SCRIPT);
    const button = join(project, aliasDir(config, config.aliases.ui), "button.tsx");
    const buttonBefore = readFileSync(button, "utf8");
    const pidPath = join(scratch, "answer-no.pid");
    pidFiles.add(pidPath);
    let ran: CommandResult;
    try {
      ran = await run(
        ["expect", expectPath, project, `${baseUrl}/r/${itemName}.json`, pidPath],
        scratch,
        { timeoutMs: 240_000 },
      );
    } finally {
      // the pty child has its own session, so its process group id is its pid
      if (existsSync(pidPath)) {
        await killGroup(Number(readFileSync(pidPath, "utf8").trim()));
      }
      pidFiles.delete(pidPath);
    }
    const failures: string[] = [];
    if (ran.output.includes("EXPECT_TIMEOUT")) {
      failures.push("timeout: no overwrite prompt was answered within 180 s");
    }
    if (ran.code !== 0) failures.push(`expect/CLI exit ${ran.code}`);
    if (!/overwrite.*\(y\/N\)/.test(ran.output))
      failures.push("the overwrite prompt was never seen");
    if (readFileSync(button, "utf8") !== buttonBefore) failures.push("user button.tsx was changed");
    if (!buttonBefore.startsWith(SENTINEL)) failures.push("sentinel line missing before add");
    const missing = item.files
      .map((file) => file.target)
      .filter((target) => !existsSync(join(project, targetToProjectPath(config, target))));
    if (missing.length > 0)
      failures.push(`item files missing: ${missing.length} of ${item.files.length}`);
    if (failures.length === 0) {
      const tsc = await run(projectBin(config.pm, "tsc", config.tscArgs), project);
      if (tsc.code !== 0) {
        const count = tsc.output.split("\n").filter((line) => /error TS\d+/.test(line)).length;
        failures.push(`tsc failed (${count} errors)`);
      }
    }
    const transcript = firstLines(ran.output, /overwrite|Skipped|Created|error/i, 6);
    cell =
      failures.length === 0
        ? { status: "ok", detail: transcript }
        : {
            status: "fail",
            detail: `${failures.map((line) => `      ${line}`).join("\n")}\n${transcript}`,
          };
    if (!keep) rmSync(root, { recursive: true, force: true });
  } finally {
    server.stop(true);
    rmSync(outDir, { recursive: true, force: true });
    if (!keep) rmSync(scratch, { recursive: true, force: true });
    else console.log(`kept temp projects under ${scratch}`);
  }
  console.log(`interactive-no: ${itemName} x next-src: ${cell.status}`);
  if (cell.detail !== "") console.log(cell.detail);
  return cell.status === "ok" ? 0 : 1;
}

async function main(): Promise<number> {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.mode === "interactive-no") {
    return await interactiveNoCheck(parsed.keep, parsed.latest);
  }
  const { items: requested, configs, keep, latest, primitives } = parsed;
  console.log(
    `user primitives (button, tooltip): ${primitives ? "present with sentinel" : "absent"}`,
  );
  if (latest) {
    toolVersions = { shadcn: "latest", "create-next-app": "latest", "create-vite": "latest" };
  }
  console.log(
    `tools: ${Object.entries(toolVersions)
      .map(([tool, version]) => `${tool}@${version}`)
      .join(", ")}`,
  );
  const primitiveFailures = await verifyPrimitives();
  console.log(
    `primitives: ${SHADCN_PRIMITIVES.length - primitiveFailures.length}/${SHADCN_PRIMITIVES.length} resolve in ${OFFICIAL_STYLE}`,
  );
  for (const failure of primitiveFailures) console.log(`  primitive ${failure}`);

  const outDir = mkdtempSync(join(tmpdir(), "registry-out-"));
  const scratch = mkdtempSync(join(tmpdir(), "registry-install-"));
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request: Request): Response {
      const path = new URL(request.url).pathname;
      const file = join(outDir, path.replace(/^\/r\//, ""));
      if (!path.startsWith("/r/") || !existsSync(file) || !statSync(file).isFile()) {
        return new Response("not found", { status: 404 });
      }
      return new Response(readFileSync(file), { headers: { "content-type": "application/json" } });
    },
  });
  const baseUrl = `http://127.0.0.1:${server.port}`;
  const result = buildPortfolioRegistry({ baseUrl });
  writeRegistry(result, outDir);
  console.log(`registry served from ${baseUrl}, scratch ${scratch}`);

  const cells = new Map<string, Cell>();
  let exitCode = primitiveFailures.length === 0 ? 0 : 1;
  const pnpmInstalled = await commandAvailable("pnpm");
  try {
    for (const configName of configs) {
      const config = CONFIGS[configName];
      if (config === undefined) continue;
      const itemNames = requested ?? [...(config.defaultItems ?? ITEMS.map((item) => item.name))];
      if (config.pm === "pnpm" && !pnpmInstalled) {
        console.log(`\n[${configName}] skipped: pnpm is not installed on this machine`);
        for (const itemName of itemNames)
          cells.set(`${itemName}|${configName}`, {
            status: "skipped",
            detail: "pnpm not installed",
          });
        continue;
      }
      console.log(`\n[${configName}] ${config.note}: creating base project`);
      const root = mkdtempSync(join(scratch, `${configName}-base-`));
      let base: string;
      try {
        base = await setupBase(root, config, primitives);
      } catch (error: unknown) {
        console.log(
          `[${configName}] base setup failed: ${error instanceof Error ? error.message : String(error)}`,
        );
        for (const itemName of itemNames)
          cells.set(`${itemName}|${configName}`, {
            status: "setup failed",
            detail: "      base project setup failed",
          });
        exitCode = 1;
        continue;
      }
      for (const itemName of itemNames) {
        const item = result.items.get(itemName);
        if (item === undefined) throw new Error(`no generated item ${itemName}`);
        if (item.meta?.primitives === "radix" && config.base === "base") {
          cells.set(`${itemName}|${configName}`, { status: "unsupported (Base UI)", detail: "" });
          console.log(`  ${itemName} x ${configName}: unsupported (Base UI)`);
          continue;
        }
        if (item.meta?.framework !== undefined && item.meta.framework !== config.framework) {
          cells.set(`${itemName}|${configName}`, {
            status: `n/a (${item.meta.framework === "next" ? "Next.js" : item.meta.framework} only)`,
            detail: "",
          });
          console.log(`  ${itemName} x ${configName}: n/a (Next.js only)`);
          continue;
        }
        const targets = item.files.map((file) => file.target);
        const started = Date.now();
        const cell = await runCell(
          base,
          scratch,
          config,
          itemName,
          `${baseUrl}/r/${itemName}.json`,
          targets,
          keep,
          primitives,
        );
        cells.set(`${itemName}|${configName}`, cell);
        console.log(
          `  ${itemName} x ${configName}: ${cell.status} (${Math.round((Date.now() - started) / 1000)}s)`,
        );
        if (cell.detail !== "") console.log(cell.detail);
        if (
          cell.status !== "ok" &&
          !cell.status.startsWith("n/a") &&
          !cell.status.startsWith("unsupported")
        )
          exitCode = 1;
      }
      if (!keep) rmSync(root, { recursive: true, force: true });
    }
  } finally {
    server.stop(true);
    rmSync(outDir, { recursive: true, force: true });
    if (!keep) rmSync(scratch, { recursive: true, force: true });
    else console.log(`kept temp projects under ${scratch}`);
  }

  console.log("\nmatrix (item x config)");
  const itemList = requested ?? ITEMS.map((item) => item.name);
  const header = ["item", ...configs];
  const rows = itemList
    .filter((itemName) => configs.some((configName) => cells.has(`${itemName}|${configName}`)))
    .map((itemName) => [
      itemName,
      ...configs.map((configName) => cells.get(`${itemName}|${configName}`)?.status ?? "-"),
    ]);
  const widths = header.map((_, column) =>
    Math.max(header[column]?.length ?? 0, ...rows.map((row) => row[column]?.length ?? 0)),
  );
  const format = (row: string[]): string =>
    row.map((cell, column) => cell.padEnd(widths[column] ?? 0)).join("  ");
  console.log(format(header));
  for (const row of rows) console.log(format(row));
  return exitCode;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main();
}
