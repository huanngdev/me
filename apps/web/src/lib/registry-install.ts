import summary from "@/generated/registry-summary.json";
import { PUBLIC_PORTFOLIO_URL } from "@repo/core/constants";

/**
 * Install facts for the docs pages. They come from the generated registry summary, so the file
 * counts, directories, packages and primitives on a page always match the published JSON.
 */

export const REGISTRY_NAMESPACE = "@huanngdev";

export const TESTED_WITH: string = summary.testedWith;

export type RegistryInstallInfo = (typeof summary.items)[number];

export function registryItemUrl(name: string): string {
  return `${PUBLIC_PORTFOLIO_URL}/r/${name}.json`;
}

export function registryInstall(name: string): RegistryInstallInfo {
  const item = summary.items.find((candidate) => candidate.name === name);
  if (item === undefined) {
    throw new Error(`no generated registry item named ${name}`);
  }
  return item;
}

/** Items published as blocks, in summary order. */
export function registryBlocks(): RegistryInstallInfo[] {
  return summary.items.filter((item) => item.type === "registry:block");
}

export function installCommands(name: string) {
  const url = registryItemUrl(name);
  return {
    bun: `bunx --bun shadcn@latest add ${url}`,
    npm: `npx shadcn@latest add ${url}`,
    pnpm: `pnpm dlx shadcn@latest add ${url}`,
    namespace: `bunx --bun shadcn@latest add ${REGISTRY_NAMESPACE}/${name}`,
  };
}

/** The components.json entry that registers the namespace once per project. */
export function namespaceSnippet(): string {
  return JSON.stringify(
    { registries: { [REGISTRY_NAMESPACE]: `${PUBLIC_PORTFOLIO_URL}/r/{name}.json` } },
    null,
    2,
  );
}
