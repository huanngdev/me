/**
 * lint-staged config — runs ESLint + Prettier only on staged files.
 *
 * Why a function map (not the shorthand):
 * - Multiple file types need different tools.
 * - We pass absolute file paths so ESLint's flat-config auto-discovery picks the correct
 *   package-local `eslint.config.mjs` per file in the monorepo.
 *
 * Why `bunx eslint`:
 * - ESLint is only installed inside workspace packages (apps/*, packages/*), not at root.
 *   `bunx` resolves to the workspace binary; calling bare `eslint` from root fails with ENOENT.
 *
 * Why ESLint is scoped to workspace files:
 * - Root-level config files (this one, commitlint.config.mjs) have no eslint.config nearby,
 *   so running ESLint on them is pointless. Prettier handles them.
 */
export default {
  "{apps,packages}/**/*.{ts,tsx,js,mjs,cjs}": (files) => [
    `bunx eslint --fix --no-warn-ignored ${files.join(" ")}`,
    `bunx prettier --write ${files.join(" ")}`,
  ],
  "**/*.{json,md,mdx,css,yml,yaml}": (files) => `bunx prettier --write ${files.join(" ")}`,
  "*.{js,mjs,cjs}": (files) => `bunx prettier --write ${files.join(" ")}`,
};
