/**
 * Tool versions for the install matrix and for the docs ("Tested with shadcn <version>").
 * Resolved with `npm view <pkg> version`. `verify-install.ts --latest` overrides them for one run.
 */
export const PINNED_VERSIONS = {
  shadcn: "4.21.4",
  "create-next-app": "16.4.0",
  "create-vite": "9.2.1",
} as const;
