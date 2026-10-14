export type ShellTokenType = "program" | "flag" | "string" | "operator" | "text" | "space";

export type ShellToken = {
  type: ShellTokenType;
  value: string;
};

const OPERATORS = new Set([";", "|"]);

function startsToken(line: string, index: number): boolean {
  const char = line[index];
  if (char === " " || char === "\t" || char === "'" || char === '"') {
    return true;
  }
  if (char !== undefined && OPERATORS.has(char)) {
    return true;
  }
  return char === "&" && line[index + 1] === "&";
}

/**
 * Splits one command line into colored spans. Concatenating every `value` gives the input back
 * byte for byte, so the rendered text never differs from the copied text.
 */
export function tokenizeCommand(line: string): ShellToken[] {
  const tokens: ShellToken[] = [];
  let index = 0;
  let nextIsProgram = true;

  while (index < line.length) {
    const char = line[index] as string;

    if (char === " " || char === "\t") {
      let value = "";
      while (index < line.length && (line[index] === " " || line[index] === "\t")) {
        value += line[index];
        index += 1;
      }
      tokens.push({ type: "space", value });
      continue;
    }

    if (char === "'" || char === '"') {
      let value = char;
      index += 1;
      while (index < line.length && line[index] !== char) {
        value += line[index];
        index += 1;
      }
      if (index < line.length) {
        value += line[index];
        index += 1;
      }
      tokens.push({ type: "string", value });
      nextIsProgram = false;
      continue;
    }

    if (OPERATORS.has(char) || (char === "&" && line[index + 1] === "&")) {
      let value = char;
      index += 1;
      if (index < line.length && line[index] === char) {
        value += line[index];
        index += 1;
      }
      tokens.push({ type: "operator", value });
      nextIsProgram = true;
      continue;
    }

    let value = "";
    while (index < line.length && !startsToken(line, index)) {
      value += line[index];
      index += 1;
    }
    const type: ShellTokenType = nextIsProgram
      ? "program"
      : value.startsWith("-")
        ? "flag"
        : "text";
    tokens.push({ type, value });
    nextIsProgram = false;
  }

  return tokens;
}
