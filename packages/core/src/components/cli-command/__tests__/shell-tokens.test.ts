import { describe, expect, test } from "bun:test";

import { tokenizeCommand, type ShellToken } from "../shell-tokens";

function types(line: string): string[] {
  return tokenizeCommand(line).map((token) => token.type);
}

function joined(tokens: readonly ShellToken[]): string {
  return tokens.map((token) => token.value).join("");
}

describe("tokenizeCommand", () => {
  test("gives back the input exactly", () => {
    const lines = [
      "bun add lucide-react",
      "bunx --bun shadcn@latest add hover-card",
      "git commit -m 'first commit'",
      'echo "a  b"  &&  bun   run   build',
      "a & b",
      "   leading and trailing   ",
      "",
    ];

    for (const line of lines) {
      expect(joined(tokenizeCommand(line))).toBe(line);
    }
  });

  test("marks the first word as the program", () => {
    expect(tokenizeCommand("bun add lucide-react")).toEqual([
      { type: "program", value: "bun" },
      { type: "space", value: " " },
      { type: "text", value: "add" },
      { type: "space", value: " " },
      { type: "text", value: "lucide-react" },
    ]);
  });

  test("marks words starting with a dash as flags", () => {
    expect(types("bun add -D typescript")).toEqual([
      "program",
      "space",
      "text",
      "space",
      "flag",
      "space",
      "text",
    ]);
    expect(tokenizeCommand("bun add -D typescript")[4]).toEqual({ type: "flag", value: "-D" });
  });

  test("keeps quoted segments whole as strings", () => {
    expect(tokenizeCommand(`git commit -m "first commit"`)).toEqual([
      { type: "program", value: "git" },
      { type: "space", value: " " },
      { type: "text", value: "commit" },
      { type: "space", value: " " },
      { type: "flag", value: "-m" },
      { type: "space", value: " " },
      { type: "string", value: '"first commit"' },
    ]);
    expect(tokenizeCommand("echo 'a b c'")[2]).toEqual({ type: "string", value: "'a b c'" });
  });

  test("treats operators as their own token and restarts the program after them", () => {
    expect(tokenizeCommand("a && b")).toEqual([
      { type: "program", value: "a" },
      { type: "space", value: " " },
      { type: "operator", value: "&&" },
      { type: "space", value: " " },
      { type: "program", value: "b" },
    ]);
    expect(tokenizeCommand("a || b")[2]).toEqual({ type: "operator", value: "||" });
    expect(tokenizeCommand("a | b")[2]).toEqual({ type: "operator", value: "|" });
    expect(tokenizeCommand("a; b")[1]).toEqual({ type: "operator", value: ";" });
  });

  test("keeps a lone ampersand inside a word", () => {
    expect(tokenizeCommand("a & b")[2]).toEqual({ type: "text", value: "&" });
  });

  test("keeps a run of whitespace as one space token", () => {
    expect(tokenizeCommand("a  \tb")[1]).toEqual({ type: "space", value: "  \t" });
  });

  test("treats a leading dash as the program, not a flag", () => {
    expect(tokenizeCommand("-x")[0]).toEqual({ type: "program", value: "-x" });
  });
});
