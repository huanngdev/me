import { codeToHtml, type BundledLanguage } from "shiki";

import { cn } from "../lib/utils";

export type TerminalBlockProps = {
  command: string;
  language?: string;
  prompt?: string;
  className?: string;
};

export async function TerminalBlock({
  command,
  language = "bash",
  prompt = "$",
  className,
}: TerminalBlockProps) {
  const html = await codeToHtml(command, {
    lang: language as BundledLanguage,
    themes: { light: "github-light-default", dark: "github-dark-default" },
    defaultColor: false,
  });

  return (
    <div
      data-slot="terminal-block"
      className={cn(
        "border-border bg-background w-full overflow-hidden rounded-xl border",
        className,
      )}
    >
      <div className="border-border flex gap-x-2 border-b px-4 py-3">
        <span className="size-2 rounded-full bg-red-500" />
        <span className="size-2 rounded-full bg-yellow-500" />
        <span className="size-2 rounded-full bg-green-500" />
      </div>
      <div className="flex items-baseline gap-2 p-4 font-mono text-sm">
        <span className="text-muted-foreground select-none">{prompt}</span>
        <div
          className="code-block-shiki min-w-0 flex-1 overflow-x-auto [&_pre]:!m-0 [&_pre]:!bg-transparent [&_pre]:!p-0"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </div>
  );
}
