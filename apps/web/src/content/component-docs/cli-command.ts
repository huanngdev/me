import type { ComponentDocs } from "./types";

export const DOCS: ComponentDocs = {
  keywords: ["cli", "terminal", "command", "install", "npm", "package manager"],
  usage: `import { CliCommand } from "@/components/cli-command/cli-command";

export function Example() {
  return <CliCommand install="lucide-react" />;
}`,
  examples: [
    {
      title: "Install dev dependencies",
      description: "dev adds the -D flag to every manager's install verb.",
      code: `<CliCommand install="typescript" dev />`,
    },
    {
      title: "Run a package binary",
      description: "npx, pnpm dlx, yarn dlx, and bunx --bun.",
      code: `<CliCommand execute="shadcn@latest add button" />`,
    },
    {
      title: "Run a package script",
      description: "npm run, pnpm, yarn, and bun run.",
      code: `<CliCommand run="build" />`,
    },
    {
      title: "Custom commands",
      description: "Pass one explicit command per manager when a resolver does not fit.",
      code: `<CliCommand
  commands={{
    npm: "npx create-next-app@latest",
    pnpm: "pnpm create next-app",
    yarn: "yarn create next-app",
    bun: "bunx create-next-app",
  }}
/>`,
    },
    {
      title: "Plain command",
      description: "A command with no manager dimension renders without tabs.",
      code: `<CliCommand command="git clone https://github.com/huanngdev/me.git" />`,
    },
  ],
  props: [
    {
      name: "install",
      type: "string",
      default: "—",
      description: "Packages to install. Resolved with install / add per manager.",
    },
    {
      name: "dev",
      type: "boolean",
      default: "false",
      description: "Adds -D right after the verb when install is set.",
    },
    {
      name: "execute",
      type: "string",
      default: "—",
      description: "A package binary, such as shadcn@latest add button.",
    },
    {
      name: "run",
      type: "string",
      default: "—",
      description: "A package.json script. Resolved with run / pnpm / yarn per manager.",
    },
    {
      name: "commands",
      type: "Record<PackageManager, string>",
      default: "—",
      description: "An explicit command per manager, shown as given.",
    },
    {
      name: "command",
      type: "string",
      default: "—",
      description: "A manager-independent command. No tabs are rendered.",
    },
    {
      name: "defaultManager",
      type: "PackageManager",
      default: '"bun"',
      description: "Manager shown before a selection is stored.",
    },
    {
      name: "prompt",
      type: "string",
      default: '"$"',
      description: "Prompt at the start of each line. Never copied.",
    },
    { name: "className", type: "string", default: "—", description: "Extra classes for the card." },
  ],
  types: `type PackageManager = "npm" | "pnpm" | "yarn" | "bun";

type CliCommandSource =
  | { install: string; dev?: boolean }
  | { execute: string }
  | { run: string }
  | { commands: Record<PackageManager, string> };

type CliCommandProps = (CliCommandSource | { command: string }) & {
  defaultManager?: PackageManager;
  prompt?: string;
  className?: string;
};`,
  notes: [],
};
