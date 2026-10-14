export function isElementRecord(node: unknown): node is Record<string, unknown> & { type: string } {
  return (
    typeof node === "object" &&
    node !== null &&
    "type" in node &&
    typeof node.type === "string" &&
    "children" in node
  );
}

// Plate's quote delete.start lifts every non-empty paragraph. A later paragraph has to
// merge, so delete.start lifts only the first child. break.empty stays on every plain
// paragraph, and liftBlock splits the container around a middle empty line.
// Callout's published rules are lineBreak, reset, and deleteExit. This match returns
// false for those, so a callout paragraph uses the same container behavior. No shortcut.
// One configure() call: a later configure() replaces __configuration and drops these rules.

export function isPropsRecord(props: unknown): props is Record<string, unknown> {
  return typeof props === "object" && props !== null && !Array.isArray(props);
}

// A void accepts the write only when every key is in its attrs. `type` never is.
