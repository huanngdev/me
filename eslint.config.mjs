/**
 * Root ESLint config.
 *
 * Why this exists at root: lint-staged runs `bunx eslint` with the repo root as cwd,
 * and ESLint flat config requires a config reachable from cwd. Without this file,
 * lint-staged crashes with "ESLint couldn't find an eslint.config.(js|mjs|cjs) file."
 *
 * Both workspaces (`apps/web`, `packages/core`) already share `@repo/eslint-config/next`,
 * so the root config is the same. The per-package configs still apply when running
 * `bun run lint` inside the package (via turbo), because ESLint picks the closest
 * `eslint.config.*` to cwd.
 */
import nextConfig from "@repo/eslint-config/next";

export default nextConfig;
