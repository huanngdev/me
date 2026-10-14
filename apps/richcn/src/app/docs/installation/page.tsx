import { CliCommand } from "@repo/core/components/cli-command/cli-command";
import { CodeBlock } from "@repo/core/components/code-block";
import Link from "next/link";

import { DocHeading } from "@/components/docs/doc-heading";
import { DocNote } from "@/components/docs/doc-note";
import { DocPage } from "@/components/docs/doc-page";
import { docHref, docMetadata } from "@/lib/docs";
import {
  EDITOR_INSTALL,
  INSTALL_COMMAND,
  INSTALL_COMMAND_BY_NAME,
  NAMESPACE_SNIPPET,
  plural,
  TESTED_WITH,
} from "@/lib/registry";

export const metadata = docMetadata("installation");

export default function InstallationPage() {
  const info = EDITOR_INSTALL;

  return (
    <DocPage slug="installation">
      <section className="space-y-3">
        <DocHeading id="install">Install with shadcn</DocHeading>
        <p>
          Run the add command in the project that will host the editor. It is the same command in a
          Next.js and in a Vite project.
        </p>
        <CliCommand execute={INSTALL_COMMAND} />
        <DocNote>
          Tested with {TESTED_WITH} on Next.js and Vite, on Tailwind v4. Read the notes below before
          you answer the prompts.
        </DocNote>
      </section>

      <section className="space-y-3">
        <DocHeading id="install-by-name">Install by name</DocHeading>
        <p>
          Register the registry once in <code className="font-mono text-sm">components.json</code>,
          then install with a short name. Nothing else changes: the same files arrive either way.
        </p>
        <CodeBlock code={NAMESPACE_SNIPPET} language="json" />
        <CliCommand execute={INSTALL_COMMAND_BY_NAME} />
      </section>

      <section className="space-y-3">
        <DocHeading id="what-it-installs">What it installs</DocHeading>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            {plural(info.ownFileCount, "file")} under{" "}
            <code className="font-mono text-sm">{info.directory}/</code>. This is the editor itself,
            including its document schema, plugins, elements and static renderer.
          </li>
          {info.helperDirectory === null ? null : (
            <li>
              {plural(info.helperFileCount, "shared helper file")} under{" "}
              <code className="font-mono text-sm">{info.helperDirectory}/</code>. Another block can
              need these too, so shadcn keeps them out of the block&apos;s own folder.
            </li>
          )}
          <li>
            {plural(info.npmPackages.length, "npm package")}: {info.npmPackages.join(", ")}.
          </li>
          <li>
            {plural(info.shadcnComponents.length, "shadcn component")} it depends on, installed from
            your own registry: {info.shadcnComponents.join(", ")}.
          </li>
          <li>
            {plural(info.registryItems.length, "other registry item")}:{" "}
            {info.registryItems.join(", ")}. The audio and video players are separate because they
            can be used on their own.
          </li>
          <li>{plural(info.cssRules, "CSS rule")} added to your global stylesheet.</li>
        </ul>
      </section>

      <section className="space-y-3">
        <DocHeading id="overwrite-prompt">The overwrite prompt</DocHeading>
        <p>
          shadcn asks before it replaces a file you already have, for example{" "}
          <code className="font-mono text-sm">components/ui/button.tsx</code>. Answer{" "}
          <strong className="font-medium">N</strong>. Your file is kept and the rest of the install
          continues; the editor works against whatever shape your local primitives already have.
        </p>
        <DocNote>
          Do not pass <code className="font-mono text-sm">--yes</code> to skip the prompts unless
          you mean to overwrite. It replaces your local primitives with the registry&apos;s
          versions, and any change you made to them is gone.
        </DocNote>
      </section>

      <section className="space-y-3">
        <DocHeading id="radix">Radix only</DocHeading>
        <p>
          This block renders the Radix component APIs. It installs and compiles in a shadcn project
          set up with Radix primitives. A project on the Base UI style does not compile without
          changes, because the same components are rendered with a different API there.
        </p>
      </section>

      <section className="space-y-3">
        <DocHeading id="css">CSS that is added</DocHeading>
        <p>
          {plural(info.cssRules, "rule")} go into the stylesheet that{" "}
          <code className="font-mono text-sm">components.json</code> points at:
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            A <code className="font-mono text-sm">link-underline</code> utility, for links in prose.
          </li>
          <li>
            Twelve syntax-highlighting rules for code blocks, keyed on{" "}
            <code className="font-mono text-sm">.editor-code .hljs-*</code> classes.
          </li>
          <li>
            Two rules for the empty block placeholder, keyed on{" "}
            <code className="font-mono text-sm">.slate-editor [data-block-placeholder]</code>.
          </li>
        </ul>
        <p>
          The registry also writes the editor&apos;s CSS variables into the{" "}
          <code className="font-mono text-sm">@theme</code>, light and dark blocks of that
          stylesheet. They are listed in{" "}
          <Link className="link-underline" href={docHref("theming")}>
            Theming
          </Link>
          .
        </p>
        <p>
          The audio and video players arrive with their own stylesheet rules, which import the
          vidstack base and caption styles.
        </p>
      </section>

      <section className="space-y-3">
        <DocHeading id="check">Check the install</DocHeading>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            The editor folder exists at <code className="font-mono text-sm">{info.directory}/</code>{" "}
            and its <code className="font-mono text-sm">index.tsx</code> exports{" "}
            <code className="font-mono text-sm">NotionLikeEditorBlock</code> and{" "}
            <code className="font-mono text-sm">NotionLikeEditorStatic</code>.
          </li>
          <li>
            Your stylesheet gained the <code className="font-mono text-sm">--editor-*</code>{" "}
            variables. Tailwind v4 scans your project by default, so the classes inside the new
            folder need no extra configuration.
          </li>
          <li>
            Import the editor from your components alias and run your type check. The import path is{" "}
            <code className="font-mono text-sm">@/components/blocks/notion-like-editor</code>.
          </li>
          <li>Every dependency is installed: the Plate packages, KaTeX, highlight.js and zod.</li>
        </ul>
      </section>
    </DocPage>
  );
}
