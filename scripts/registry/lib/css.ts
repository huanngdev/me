/**
 * Copies named rules out of `globals.css` into shadcn registry `css` / `cssVars`
 * objects, so an item ships the styles its classes need without hand-copied CSS.
 *
 * Supported input: top-level rules, `@keyframes`, `@utility`, `@theme`, and nested
 * blocks. Declarations are `prop: value`; bare statements such as `@apply ...;` are kept
 * as `"@apply ...": {}` keys, the shape shadcn expects.
 */

export type StyleSelection = {
  /** Top-level rules whose selector starts with one of these prefixes (e.g. `.slate-editor`). */
  selectors?: readonly string[];
  /** `@keyframes` names to copy. */
  keyframes?: readonly string[];
  /** `@utility` names to copy. */
  utilities?: readonly string[];
  /** Custom property prefixes copied from `:root`, `.dark` and `@theme inline`. */
  variables?: readonly string[];
};

export type StyleBundle = {
  css: Record<string, unknown>;
  cssVars: Partial<Record<"theme" | "light" | "dark", Record<string, string>>>;
};

type Statement = { kind: "declaration"; text: string } | { kind: "block"; node: BlockNode };

type BlockNode = { prelude: string; body: Statement[] };

function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "");
}

/** Parses the top-level blocks of a stylesheet. Throws on unbalanced braces. */
export function parseStylesheet(source: string): BlockNode[] {
  const text = stripComments(source);
  let position = 0;

  const parseBody = (closing: boolean): Statement[] => {
    const statements: Statement[] = [];
    let buffer = "";
    while (position < text.length) {
      const character = text.charAt(position);
      position += 1;
      if (character === "{") {
        const prelude = buffer.trim().replace(/\s+/g, " ");
        statements.push({ kind: "block", node: { prelude, body: parseBody(true) } });
        buffer = "";
      } else if (character === "}") {
        if (!closing) {
          throw new Error(`unexpected } at offset ${position - 1}`);
        }
        if (buffer.trim() !== "") {
          statements.push({ kind: "declaration", text: buffer.trim().replace(/\s+/g, " ") });
        }
        return statements;
      } else if (character === ";") {
        if (buffer.trim() !== "") {
          statements.push({ kind: "declaration", text: buffer.trim() });
        }
        buffer = "";
      } else {
        buffer += character;
      }
    }
    if (closing) {
      throw new Error("unbalanced { in stylesheet");
    }
    if (buffer.trim() !== "") {
      statements.push({ kind: "declaration", text: buffer.trim() });
    }
    return statements;
  };

  const top: BlockNode[] = [];
  for (const statement of parseBody(false)) {
    if (statement.kind === "block") {
      top.push(statement.node);
    }
  }
  return top;
}

function serializeBody(statements: readonly Statement[]): Record<string, unknown> {
  const object: Record<string, unknown> = {};
  for (const statement of statements) {
    if (statement.kind === "block") {
      object[statement.node.prelude] = serializeBody(statement.node.body);
      continue;
    }
    const colon = declarationColon(statement.text);
    if (colon === -1) {
      object[statement.text] = {};
    } else {
      object[statement.text.slice(0, colon).trim()] = statement.text.slice(colon + 1).trim();
    }
  }
  return object;
}

/** Index of the colon that separates a property from its value, or -1 for a bare statement. */
function declarationColon(text: string): number {
  if (text.startsWith("@")) {
    return -1;
  }
  return text.indexOf(":");
}

function declarationsOf(statements: readonly Statement[]): Array<[string, string]> {
  const pairs: Array<[string, string]> = [];
  for (const statement of statements) {
    if (statement.kind !== "declaration") {
      continue;
    }
    const colon = declarationColon(statement.text);
    if (colon === -1) {
      continue;
    }
    pairs.push([statement.text.slice(0, colon).trim(), statement.text.slice(colon + 1).trim()]);
  }
  return pairs;
}

export function extractStyles(globalsCss: string, selection: StyleSelection): StyleBundle {
  const top = parseStylesheet(globalsCss);
  const css: Record<string, unknown> = {};
  const cssVars: StyleBundle["cssVars"] = {};
  const variablePrefixes = selection.variables ?? [];
  const matchesVariable = (name: string): boolean =>
    variablePrefixes.some((prefix) => name.startsWith(prefix));

  const addVariables = (
    target: "theme" | "light" | "dark",
    pairs: Array<[string, string]>,
  ): void => {
    for (const [name, value] of pairs) {
      if (name.startsWith("--") && matchesVariable(name)) {
        cssVars[target] = { ...(cssVars[target] ?? {}), [name]: value };
      }
    }
  };

  const used = new Set<string>();
  for (const node of top) {
    const { prelude } = node;
    if (prelude === ":root") {
      addVariables("light", declarationsOf(node.body));
    } else if (prelude === ".dark") {
      addVariables("dark", declarationsOf(node.body));
    } else if (prelude === "@theme inline" || prelude === "@theme") {
      addVariables("theme", declarationsOf(node.body));
    }

    const selectorMatch = (selection.selectors ?? []).some((prefix) => prelude.startsWith(prefix));
    const keyframeMatch = (selection.keyframes ?? []).some(
      (name) => prelude === `@keyframes ${name}`,
    );
    const utilityMatch = (selection.utilities ?? []).some((name) => prelude === `@utility ${name}`);
    if (selectorMatch || keyframeMatch || utilityMatch) {
      css[prelude] = serializeBody(node.body);
      used.add(prelude);
    }
  }

  const missing = [
    ...(selection.keyframes ?? []).map((name) => `@keyframes ${name}`),
    ...(selection.utilities ?? []).map((name) => `@utility ${name}`),
  ].filter((prelude) => !used.has(prelude));
  if (missing.length > 0) {
    throw new Error(`globals.css has no rule for: ${missing.join(", ")}`);
  }
  return { css, cssVars };
}
