/**
 * commitlint config — enforces Conventional Commits.
 *
 * Spec: https://www.conventionalcommits.org
 *
 * Format: <type>(<scope>)<!>: <subject>
 *   - `<type>`     — see `type-enum` below
 *   - `<scope>`    — optional; the area of the codebase (e.g. `web`, `core`, `ui`, `docs`)
 *   - `<!>`        — optional breaking-change marker
 *   - `<subject>`  — imperative mood, no period, ≤ 72 chars
 *
 * Examples:
 *   feat(web): add hero section with avatar lights interaction
 *   fix(core): correct twMerge import path in utils.ts
 *   chore: bump turbo to 2.9.14
 *   docs(reference): clarify section order rules
 */
export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    // Allowed commit types. Keep this list short and meaningful.
    "type-enum": [
      2,
      "always",
      [
        "feat", // new feature visible to users
        "fix", // bug fix
        "refactor", // code change that neither fixes a bug nor adds a feature
        "perf", // performance improvement
        "style", // formatting, missing semis, etc. (no code logic change)
        "docs", // documentation only
        "test", // adding or fixing tests
        "build", // build system, deps, bundlers
        "ci", // CI configuration (GitHub Actions, etc.)
        "chore", // routine maintenance that doesn't fit above
        "revert", // revert a previous commit
      ],
    ],
    "type-case": [2, "always", "lower-case"],
    "subject-case": [2, "never", ["sentence-case", "start-case", "pascal-case", "upper-case"]],
    "subject-empty": [2, "never"],
    "subject-full-stop": [2, "never", "."],
    "subject-max-length": [2, "always", 72],
    "header-max-length": [2, "always", 100],
    "body-leading-blank": [1, "always"],
    "footer-leading-blank": [1, "always"],
  },
};
