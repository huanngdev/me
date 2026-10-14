"use client";

import { Terminal } from "lucide-react";

import { cn } from "../../lib/utils";
import { CopyButton } from "../copy-button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../tabs";
import { PACKAGE_MANAGER_ICONS } from "./package-manager-icons";
import {
  isPackageManager,
  PACKAGE_MANAGERS,
  resolveCommands,
  type CliCommandSource,
  type PackageManager,
} from "./package-managers";
import { tokenizeCommand, type ShellTokenType } from "./shell-tokens";
import { usePackageManager } from "./use-package-manager";

export type CliCommandProps = (CliCommandSource | { command: string }) & {
  defaultManager?: PackageManager;
  prompt?: string;
  className?: string;
};

const DEFAULT_PROMPT = "$";

const TOKEN_CLASS: Record<ShellTokenType, string> = {
  program: "font-medium text-foreground",
  flag: "text-primary",
  string: "text-muted-foreground",
  operator: "text-muted-foreground",
  text: "text-foreground/80",
  space: "",
};

const CARD_CLASS = "@container bg-background overflow-hidden rounded-xl border";

// The active tab's `::after` must sit inside the trigger so `overflow-x-auto` on the list cannot
// clip it. The primitive positions it at `bottom-[-5px]`; `-bottom-px` lands it on the header
// border (the trigger's transparent 1px border offsets the absolutely positioned box).
// The list repeats the primitive's `group-data-horizontal/tabs:` variant on height and width so
// tailwind-merge drops the primitive's `h-8`/`w-fit` for one trigger-filled row.
const TAB_LIST_CLASS =
  "no-scrollbar group-data-horizontal/tabs:h-full w-full min-w-0 flex-1 justify-start gap-1 overflow-x-auto p-0 [&_[data-slot=tabs-trigger][data-state=active]]:after:-bottom-px";
const TRIGGER_CLASS = "h-full flex-none gap-1 [&>svg]:hidden @min-[20rem]:[&>svg]:block";

function CommandBody({ command, prompt }: { command: string; prompt: string }) {
  return (
    <pre className="overflow-x-auto p-4 font-mono text-sm whitespace-pre">
      <code>
        {command.split("\n").map((line, lineIndex) => (
          <span key={lineIndex} className="block">
            <span aria-hidden className="text-muted-foreground select-none">
              {prompt}{" "}
            </span>
            {tokenizeCommand(line).map((token, tokenIndex) => (
              <span key={tokenIndex} className={TOKEN_CLASS[token.type]}>
                {token.value}
              </span>
            ))}
          </span>
        ))}
      </code>
    </pre>
  );
}

function PlainCommand({
  command,
  prompt,
  className,
}: {
  command: string;
  prompt: string;
  className?: string;
}) {
  return (
    <div className={cn(CARD_CLASS, className)}>
      <header className="flex h-10 shrink-0 items-center justify-between border-b pr-2 pl-3">
        <Terminal className="text-muted-foreground size-4" />
        <CopyButton text={command} size="icon-sm" aria-label="Copy command" className="shrink-0" />
      </header>
      <CommandBody command={command} prompt={prompt} />
    </div>
  );
}

function PackageManagerCommand({
  source,
  defaultManager,
  prompt,
  className,
}: {
  source: CliCommandSource;
  defaultManager: PackageManager;
  prompt: string;
  className?: string;
}) {
  const [manager, setManager] = usePackageManager(defaultManager);
  const commands = resolveCommands(source);

  return (
    <Tabs
      value={manager}
      onValueChange={(value) => {
        if (isPackageManager(value)) setManager(value);
      }}
      className={cn(CARD_CLASS, "gap-0", className)}
    >
      <header className="flex h-10 shrink-0 items-center justify-between gap-2 border-b pr-2 pl-1.5">
        <TabsList variant="line" className={TAB_LIST_CLASS}>
          {PACKAGE_MANAGERS.map((name) => {
            const Icon = PACKAGE_MANAGER_ICONS[name];
            return (
              <TabsTrigger key={name} value={name} className={TRIGGER_CLASS}>
                <Icon />
                {name}
              </TabsTrigger>
            );
          })}
        </TabsList>
        <CopyButton
          text={commands[manager]}
          size="icon-sm"
          aria-label="Copy command"
          className="shrink-0"
        />
      </header>
      {PACKAGE_MANAGERS.map((name) => (
        <TabsContent key={name} value={name}>
          <CommandBody command={commands[name]} prompt={prompt} />
        </TabsContent>
      ))}
    </Tabs>
  );
}

export function CliCommand({ prompt = DEFAULT_PROMPT, className, ...rest }: CliCommandProps) {
  if ("command" in rest) {
    return <PlainCommand command={rest.command} prompt={prompt} className={className} />;
  }
  return (
    <PackageManagerCommand
      source={rest}
      defaultManager={rest.defaultManager ?? "bun"}
      prompt={prompt}
      className={className}
    />
  );
}
