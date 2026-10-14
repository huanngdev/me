import type { Metadata } from "next";

import { CliCommand } from "@repo/core/components/cli-command/cli-command";
import { CodeBlock } from "@repo/core/components/code-block";
import { ComponentDemo } from "@repo/core/components/component-demo";
import { PageHeader } from "@repo/core/components/layouts/page-header";
import { Separator } from "@repo/core/components/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/core/components/table";
import { TOCMinimap, type TOCItemType } from "@repo/core/components/toc-minimap";

import { readLlmsDocument } from "@/lib/read-llms-document";
import { RegistryInstall } from "@/components/registry-install";

const LLM_TEXT = readLlmsDocument("components", "cli-command");

const TOC: TOCItemType[] = [
  { title: "Demo", url: "#demo", depth: 2 },
  { title: "Install", url: "#install", depth: 2 },
  { title: "Usage", url: "#usage", depth: 2 },
  { title: "Props", url: "#props", depth: 2 },
  { title: "Types", url: "#types", depth: 2 },
  { title: "Notes", url: "#notes", depth: 2 },
];

export const metadata: Metadata = {
  title: "CLI Command",
  description: "A command block with a tab per package manager.",
  alternates: { canonical: "/components/cli-command" },
};

const INSTALL_CODE = `import { CliCommand } from "@/components/cli-command/cli-command";

export function Example() {
  return <CliCommand install="lucide-react" />;
}`;

const DEV_CODE = `<CliCommand install="typescript" dev />`;

const EXECUTE_CODE = `<CliCommand execute="shadcn@latest add button" />`;

const RUN_CODE = `<CliCommand run="build" />`;

const COMMANDS_CODE = `<CliCommand
  commands={{
    npm: "npx create-next-app@latest",
    pnpm: "pnpm create next-app",
    yarn: "yarn create next-app",
    bun: "bunx create-next-app",
  }}
/>`;

const PLAIN_CODE = `<CliCommand command="git clone https://github.com/huanngdev/me.git" />`;

const TYPES_CODE = `type PackageManager = "npm" | "pnpm" | "yarn" | "bun";

type CliCommandSource =
  | { install: string; dev?: boolean }
  | { execute: string }
  | { run: string }
  | { commands: Record<PackageManager, string> };

type CliCommandProps = (CliCommandSource | { command: string }) & {
  defaultManager?: PackageManager;
  prompt?: string;
  className?: string;
};`;

const PROPS: { name: string; type: string; default: string; description: string }[] = [
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
];

function Section({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title?: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="px-4 py-8 sm:px-6 lg:px-8">
      {title && <h2 className="text-lg font-semibold tracking-tight">{title}</h2>}
      {description && <p className="text-muted-foreground mt-1 text-sm">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Demo({
  title,
  description,
  code,
  children,
}: {
  title: string;
  description: string;
  code: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-medium">{title}</h3>
        <p className="text-muted-foreground text-sm">{description}</p>
      </div>
      <ComponentDemo llm={LLM_TEXT} code={code}>
        {children}
      </ComponentDemo>
    </div>
  );
}

export default function CliCommandComponentPage() {
  return (
    <>
      <div
        aria-label="Section navigation"
        className="pointer-events-none fixed top-1/2 left-4 z-30 hidden -translate-y-1/2 xl:block"
      >
        <div className="pointer-events-auto">
          <TOCMinimap items={TOC} />
        </div>
      </div>
      <PageHeader
        title="CLI Command"
        description="A command block with a tab per package manager."
      />
      <article className="mx-auto flex w-full max-w-4xl flex-1 flex-col border-x">
        <Section id="demo">
          <div className="space-y-8">
            <Demo
              title="Install packages"
              description="The default tabs cover npm, pnpm, yarn, and bun."
              code={INSTALL_CODE}
            >
              <CliCommand install="lucide-react" />
            </Demo>
            <Demo
              title="Install dev dependencies"
              description="dev adds the -D flag to every manager's install verb."
              code={DEV_CODE}
            >
              <CliCommand install="typescript" dev />
            </Demo>
            <Demo
              title="Run a package binary"
              description="npx, pnpm dlx, yarn dlx, and bunx --bun."
              code={EXECUTE_CODE}
            >
              <CliCommand execute="shadcn@latest add button" />
            </Demo>
            <Demo
              title="Run a package script"
              description="npm run, pnpm, yarn, and bun run."
              code={RUN_CODE}
            >
              <CliCommand run="build" />
            </Demo>
            <Demo
              title="Custom commands"
              description="Pass one explicit command per manager when a resolver does not fit."
              code={COMMANDS_CODE}
            >
              <CliCommand
                commands={{
                  npm: "npx create-next-app@latest",
                  pnpm: "pnpm create next-app",
                  yarn: "yarn create next-app",
                  bun: "bunx create-next-app",
                }}
              />
            </Demo>
            <Demo
              title="Plain command"
              description="A command with no manager dimension renders without tabs."
              code={PLAIN_CODE}
            >
              <CliCommand command="git clone https://github.com/huanngdev/me.git" />
            </Demo>
          </div>
        </Section>
        <Separator />

        <Section
          id="install"
          title="Install"
          description="Install with one shadcn command, or add the files by hand."
        >
          <RegistryInstall name="cli-command" />
        </Section>
        <Separator />

        <Section
          id="usage"
          title="Usage"
          description="Pick the source kind that matches the command, then read the active tab."
        >
          <div className="space-y-4">
            <CodeBlock code={INSTALL_CODE} />
            <p className="text-muted-foreground text-sm leading-relaxed">
              Selecting a tab stores the choice in <code>localStorage</code>, so every command on
              the page follows it and the next page load starts on the manager you picked.
            </p>
          </div>
        </Section>
        <Separator />

        <Section id="props" title="Props">
          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[160px]">Prop</TableHead>
                  <TableHead className="w-[220px]">Type</TableHead>
                  <TableHead className="w-[110px]">Default</TableHead>
                  <TableHead>Description</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {PROPS.map((p) => (
                  <TableRow key={p.name}>
                    <TableCell className="font-mono text-xs">{p.name}</TableCell>
                    <TableCell className="text-muted-foreground font-mono text-xs">
                      {p.type}
                    </TableCell>
                    <TableCell className="text-muted-foreground font-mono text-xs">
                      {p.default}
                    </TableCell>
                    <TableCell className="text-sm">{p.description}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Section>
        <Separator />

        <Section id="types" title="Types">
          <CodeBlock code={TYPES_CODE} language="ts" />
        </Section>
        <Separator />

        <Section id="notes" title="Notes">
          <ul className="text-muted-foreground list-disc space-y-1 pl-5 text-sm">
            <li>
              The selected manager is remembered in <code>localStorage</code> under{" "}
              <code>package-manager</code> and synced across every command on the page and across
              browser tabs.
            </li>
            <li>
              Copy copies exactly the shown command — the active manager&apos;s on the tabbed form.
              The prompt is decorative and is never selectable or copied.
            </li>
            <li>Long commands scroll inside the card, so the page never scrolls sideways.</li>
          </ul>
        </Section>
      </article>
    </>
  );
}
