/**
 * Minimal glob matcher for `exclude` patterns. Patterns are matched against
 * repo-relative POSIX paths under `packages/core/src` and may match at any
 * depth, so `demo/**` excludes `components/blocks/x/demo/a.ts`.
 *
 * Supported: `**` (any depth), `*` (no slash), `?` (one non-slash char).
 */
export function globToRegExp(glob: string): RegExp {
  let source = "";
  for (let index = 0; index < glob.length; index += 1) {
    const character = glob.charAt(index);
    if (character === "*") {
      if (glob.charAt(index + 1) === "*") {
        index += 1;
        if (glob.charAt(index + 1) === "/") {
          index += 1;
          source += "(?:.*/)?";
        } else {
          source += ".*";
        }
      } else {
        source += "[^/]*";
      }
    } else if (character === "?") {
      source += "[^/]";
    } else {
      source += character.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`(?:^|/)${source}$`);
}

export function matchesAnyGlob(path: string, globs: readonly string[]): boolean {
  return globs.some((glob: string): boolean => globToRegExp(glob).test(path));
}
