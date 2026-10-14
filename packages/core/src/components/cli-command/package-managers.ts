export const PACKAGE_MANAGERS = ["npm", "pnpm", "yarn", "bun"] as const;

export type PackageManager = (typeof PACKAGE_MANAGERS)[number];

export function isPackageManager(value: string | null): value is PackageManager {
  return value !== null && (PACKAGE_MANAGERS as readonly string[]).includes(value);
}

export type CliCommandSource =
  | { install: string; dev?: boolean }
  | { execute: string }
  | { run: string }
  | { commands: Record<PackageManager, string> };

const INSTALLERS: Record<PackageManager, string> = {
  npm: "npm install",
  pnpm: "pnpm add",
  yarn: "yarn add",
  bun: "bun add",
};

const EXECUTORS: Record<PackageManager, string> = {
  npm: "npx",
  pnpm: "pnpm dlx",
  yarn: "yarn dlx",
  bun: "bunx --bun",
};

const RUNNERS: Record<PackageManager, string> = {
  npm: "npm run",
  pnpm: "pnpm",
  yarn: "yarn",
  bun: "bun run",
};

function normalize(value: string): string {
  return value
    .split("\n")
    .map((line) => line.trim().replace(/[ \t]+/g, " "))
    .join("\n")
    .trim();
}

function withVerb(verb: string, body: string): string {
  return body === "" ? verb : `${verb} ${body}`;
}

function perManager(build: (manager: PackageManager) => string): Record<PackageManager, string> {
  return {
    npm: build("npm"),
    pnpm: build("pnpm"),
    yarn: build("yarn"),
    bun: build("bun"),
  };
}

export function resolveCommands(source: CliCommandSource): Record<PackageManager, string> {
  if ("commands" in source) {
    return { ...source.commands };
  }
  if ("install" in source) {
    const packages = normalize(source.install);
    const flag = source.dev === true ? " -D" : "";
    return perManager((manager) => withVerb(`${INSTALLERS[manager]}${flag}`, packages));
  }
  if ("execute" in source) {
    const command = normalize(source.execute);
    return perManager((manager) => withVerb(EXECUTORS[manager], command));
  }
  const script = normalize(source.run);
  return perManager((manager) => withVerb(RUNNERS[manager], script));
}
