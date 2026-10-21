import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { z } from "zod";

/** Works whether the process starts in apps/web (Next.js) or at the repo root (scripts, tests). */
const WEB_ROOT = process.cwd().endsWith("apps/web")
  ? process.cwd()
  : path.join(process.cwd(), "apps/web");
const REGISTRY_DIR = path.join(WEB_ROOT, "public", "r");

/** Item names are lowercase slugs. Anything else never reaches the filesystem. */
const NAME_PATTERN = /^[a-z0-9-]+$/;

export const RegistryIndexItemSchema = z.object({
  name: z.string().regex(NAME_PATTERN),
  type: z.string(),
  title: z.string(),
  description: z.string(),
  dependencies: z.array(z.string()),
  registryDependencies: z.array(z.string()),
});

export const RegistryIndexSchema = z.object({
  items: z.array(RegistryIndexItemSchema),
});

export const RegistryFileSchema = z.object({
  path: z.string(),
  type: z.string(),
  target: z.string(),
  content: z.string(),
});

export const RegistryItemSchema = RegistryIndexItemSchema.extend({
  files: z.array(RegistryFileSchema),
});

export type RegistryIndexItem = z.infer<typeof RegistryIndexItemSchema>;
export type RegistryFile = z.infer<typeof RegistryFileSchema>;
export type RegistryItem = z.infer<typeof RegistryItemSchema>;

let indexCache: RegistryIndexItem[] | undefined;
const itemCache = new Map<string, RegistryItem>();

function readJson(file: string): unknown {
  // JSON.parse yields `any`; it is immediately narrowed to `unknown` and checked by zod below.
  const text = readFileSync(file, "utf8");
  const parsed: unknown = JSON.parse(text);
  return parsed;
}

export function readRegistryIndex(): RegistryIndexItem[] {
  if (indexCache === undefined) {
    const file = path.join(REGISTRY_DIR, "registry.json");
    const parsed = RegistryIndexSchema.safeParse(readJson(file));
    if (!parsed.success) {
      throw new Error(`${file} does not match the registry index schema: ${parsed.error.message}`);
    }
    indexCache = parsed.data.items;
  }
  return indexCache;
}

/**
 * Reads one registry item JSON. The index is the allowlist: only names it lists are read, so a
 * traversal string like `../x` can never reach the filesystem.
 */
export function readRegistryItem(name: string): RegistryItem | undefined {
  if (!NAME_PATTERN.test(name)) {
    return undefined;
  }
  const cached = itemCache.get(name);
  if (cached !== undefined) {
    return cached;
  }
  if (!readRegistryIndex().some((item) => item.name === name)) {
    return undefined;
  }
  const file = path.join(REGISTRY_DIR, `${name}.json`);
  if (!existsSync(file)) {
    return undefined;
  }
  const parsed = RegistryItemSchema.safeParse(readJson(file));
  if (!parsed.success) {
    throw new Error(`${file} does not match the registry item schema: ${parsed.error.message}`);
  }
  itemCache.set(name, parsed.data);
  return parsed.data;
}
