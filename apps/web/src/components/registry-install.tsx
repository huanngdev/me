import { CliCommand } from "@repo/core/components/cli-command/cli-command";
import { CodeBlock } from "@repo/core/components/code-block";

import {
  installCommands,
  namespaceSnippet,
  registryInstall,
  REGISTRY_NAMESPACE,
  TESTED_WITH,
  type RegistryInstallInfo,
} from "@/lib/registry-install";

const OVERWRITE_NOTE =
  "If shadcn asks to overwrite a component you already have, answer N. Your file is kept and the rest is installed.";
const RADIX_NOTE = "Requires Radix-based shadcn components. Base UI styles are not supported.";
const NEXT_NOTE = "Requires Next.js.";

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function InstallFacts({ info }: { info: RegistryInstallInfo }) {
  return (
    <ul className="text-muted-foreground list-disc space-y-1 pl-5 text-sm">
      <li>
        {plural(info.ownFileCount, "file")} in <code>{info.directory}/</code>
        {info.helperFileCount > 0 ? (
          <>
            , plus {plural(info.helperFileCount, "shared helper file")} in{" "}
            <code>{info.helperDirectory}/</code>
          </>
        ) : null}
      </li>
      {info.npmPackages.length > 0 ? <li>npm packages: {info.npmPackages.join(", ")}</li> : null}
      {info.shadcnComponents.length > 0 ? (
        <li>shadcn components it depends on: {info.shadcnComponents.join(", ")}</li>
      ) : null}
      {info.registryItems.length > 0 ? (
        <li>other items it needs: {info.registryItems.join(", ")}</li>
      ) : null}
      {info.cssRules > 0 ? (
        <li>{plural(info.cssRules, "CSS rule")} added to your global stylesheet</li>
      ) : null}
    </ul>
  );
}

function InstallNotes({ info }: { info: RegistryInstallInfo }) {
  return (
    <ul className="text-muted-foreground list-disc space-y-1 pl-5 text-sm">
      <li>{OVERWRITE_NOTE}</li>
      {info.primitives === "radix" ? <li>{RADIX_NOTE}</li> : null}
      {info.framework === "next" ? <li>{NEXT_NOTE}</li> : null}
      <li>Tested with {TESTED_WITH} on Next.js and Vite, Tailwind v4.</li>
    </ul>
  );
}

/** Namespace setup, once per project. Rendered by `RegistryInstall`. */
function RegistryNamespace({ name }: { name?: string }) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Optional: install by name</p>
      <p className="text-muted-foreground text-sm">
        Register <code>{REGISTRY_NAMESPACE}</code> once in <code>components.json</code>, then
        install with the name.
      </p>
      <CodeBlock code={namespaceSnippet()} language="json" />
      {name === undefined ? null : <CliCommand execute={installCommands(name).namespace} />}
    </div>
  );
}

export async function RegistryInstall({ name }: { name: string }) {
  const info = registryInstall(name);
  const commands = installCommands(name);
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="text-sm font-medium">Install with shadcn</p>
        <CliCommand execute={commands.url} />
      </div>
      <div className="space-y-2">
        <p className="text-sm font-medium">What it installs</p>
        <InstallFacts info={info} />
      </div>
      <div className="space-y-2">
        <p className="text-sm font-medium">Notes</p>
        <InstallNotes info={info} />
      </div>
      <RegistryNamespace name={name} />
    </div>
  );
}
