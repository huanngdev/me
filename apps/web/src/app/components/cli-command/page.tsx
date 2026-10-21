import type { Metadata } from "next";

import { CliCommand } from "@repo/core/components/cli-command/cli-command";
import { CodeBlock } from "@repo/core/components/code-block";
import { ComponentDemo } from "@repo/core/components/component-demo";
import { ComponentPreviewFrame } from "@repo/core/components/layouts/component-preview-frame";
import { Separator } from "@repo/core/components/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/core/components/table";

import { readSourceFiles } from "@/lib/read-source-files";
import { RegistryInstall } from "@/components/registry-install";
import { DOCS } from "@/content/component-docs/cli-command";

const SOURCE_FILES = readSourceFiles([
  "packages/core/src/components/cli-command/package-managers.ts",
  "packages/core/src/components/cli-command/shell-tokens.ts",
  "packages/core/src/components/cli-command/package-manager-icons.tsx",
  "packages/core/src/components/cli-command/use-package-manager.ts",
  "packages/core/src/components/cli-command/cli-command.tsx",
]);

export const metadata: Metadata = {
  title: "CLI Command",
  description: "A command block with a tab per package manager.",
  alternates: { canonical: "/components/cli-command" },
};

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
    <section id={id} className="py-8">
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
      <ComponentDemo code={code}>{children}</ComponentDemo>
    </div>
  );
}

export default function CliCommandComponentPage() {
  return (
    <ComponentPreviewFrame name="cli-command" files={SOURCE_FILES} docs={<Docs />}>
      <CliCommand install="lucide-react" />
    </ComponentPreviewFrame>
  );
}

function Docs() {
  return (
    <>
      <header className="pb-2">
        <h1 className="text-2xl font-semibold tracking-tight">CLI Command</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          A command block with a tab per package manager.
        </p>
      </header>

      <Section id="examples" title="Examples">
        <div className="space-y-8">
          <Demo
            title="Install dev dependencies"
            description="dev adds the -D flag to every manager's install verb."
            code={DOCS.examples[0]!.code}
          >
            <CliCommand install="typescript" dev />
          </Demo>
          <Demo
            title="Run a package binary"
            description="npx, pnpm dlx, yarn dlx, and bunx --bun."
            code={DOCS.examples[1]!.code}
          >
            <CliCommand execute="shadcn@latest add button" />
          </Demo>
          <Demo
            title="Run a package script"
            description="npm run, pnpm, yarn, and bun run."
            code={DOCS.examples[2]!.code}
          >
            <CliCommand run="build" />
          </Demo>
          <Demo
            title="Custom commands"
            description="Pass one explicit command per manager when a resolver does not fit."
            code={DOCS.examples[3]!.code}
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
            code={DOCS.examples[4]!.code}
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
          <CodeBlock code={DOCS.usage} />
          <p className="text-muted-foreground text-sm leading-relaxed">
            Selecting a tab stores the choice in <code>localStorage</code>, so every command on the
            page follows it and the next page load starts on the manager you picked.
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
              {DOCS.props.map((p) => (
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
        <CodeBlock code={DOCS.types} language="ts" />
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
    </>
  );
}
