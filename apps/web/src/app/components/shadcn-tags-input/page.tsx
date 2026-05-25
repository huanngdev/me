import type { Metadata } from "next";
import { ExternalLink } from "lucide-react";

import { CodeBlock } from "@repo/core/components/code-block";
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
import { TerminalBlock } from "@repo/core/components/terminal-block";
import { TOCMinimap, type TOCItemType } from "@repo/core/components/toc-minimap";

import registry from "../../../../public/r/shadcn-tags-input.json";
import { BasicDemo, ConstrainedDemo, ZodDemo } from "./demo";

const REGISTRY_URL = "https://huanngdev.site/r/shadcn-tags-input.json";
const REPO_URL =
  "https://github.com/huanngdev/me/blob/main/packages/core/src/components/shadcn-tags-input/tags-input.tsx";

const TOC: TOCItemType[] = [
  { title: "Demo", url: "#demo", depth: 2 },
  { title: "Install", url: "#install", depth: 2 },
  { title: "Usage", url: "#usage", depth: 2 },
  { title: "useTagsInput hook", url: "#hook", depth: 2 },
  { title: "With constraints", url: "#constrained", depth: 2 },
  { title: "Zod validation", url: "#zod", depth: 2 },
  { title: "Props", url: "#props", depth: 2 },
  { title: "Types", url: "#types", depth: 2 },
];

export const metadata: Metadata = {
  title: "Tags Input",
  description: "A composable tags input built on shadcn primitives.",
  alternates: { canonical: "/components/shadcn-tags-input" },
};

const CLI_COMMAND = `bunx --bun shadcn@latest add ${REGISTRY_URL}`;
const NAMESPACE_COMMAND = `bunx --bun shadcn@latest add @huanng/shadcn-tags-input`;
const DEPS_COMMAND = `bun add lucide-react`;
const SHADCN_DEPS_COMMAND = `bunx --bun shadcn@latest add badge`;

const TAGS_INPUT_SOURCE = registry.files[0]!.content;

const BASIC_USAGE_CODE = `"use client";

import * as React from "react";
import { TagsInput } from "@/components/shadcn-tags-input/tags-input";

export function Example() {
  const [tags, setTags] = React.useState<string[]>(["typescript", "next.js"]);
  return (
    <TagsInput
      value={tags}
      onChange={setTags}
      placeholder="Type and press Enter..."
    />
  );
}`;

const HOOK_USAGE_CODE = `import { useTagsInput } from "@/components/shadcn-tags-input/tags-input";

const { tags, addTag, removeTag, clear } = useTagsInput({
  defaultValue: ["alpha"],
  maxTags: 5,
  minLength: 2,
});

const result = addTag("beta");
if (result !== true) console.error(result); // "Tag must be at least 2 characters"`;

const ZOD_USAGE_CODE = `"use client";

import * as React from "react";
import { z } from "zod";
import { TagsInput } from "@/components/shadcn-tags-input/tags-input";

const schema = z.object({
  tags: z
    .array(z.string().min(2).max(16))
    .min(1, "Add at least one tag")
    .max(5, "Maximum 5 tags allowed"),
});

export function TagsForm() {
  const [tags, setTags] = React.useState<string[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const result = schema.safeParse({ tags });
    if (!result.success) {
      setError(result.error.issues[0]?.message ?? "Invalid");
      return;
    }
    setError(null);
    // submit result.data.tags
  };

  return (
    <form onSubmit={onSubmit}>
      <TagsInput
        value={tags}
        onChange={setTags}
        maxTags={5}
        aria-invalid={Boolean(error)}
      />
      {error && <p className="text-destructive text-xs">{error}</p>}
      <button type="submit">Submit</button>
    </form>
  );
}`;

const PROPS: { name: string; type: string; default: string; description: string }[] = [
  { name: "value", type: "string[]", default: "—", description: "Controlled tags array." },
  {
    name: "defaultValue",
    type: "string[]",
    default: "[]",
    description: "Initial tags (uncontrolled mode).",
  },
  {
    name: "onChange",
    type: "(value: string[]) => void",
    default: "—",
    description: "Fires when the tags array changes.",
  },
  {
    name: "placeholder",
    type: "string",
    default: '"Add a tag..."',
    description: "Placeholder shown when there are no tags.",
  },
  {
    name: "disabled",
    type: "boolean",
    default: "false",
    description: "Disables input and tag removal.",
  },
  { name: "maxTags", type: "number", default: "—", description: "Maximum number of tags allowed." },
  { name: "minLength", type: "number", default: "1", description: "Minimum length per tag." },
  { name: "maxLength", type: "number", default: "—", description: "Maximum length per tag." },
  {
    name: "allowDuplicates",
    type: "boolean",
    default: "false",
    description: "Allow the same tag to be added more than once.",
  },
  {
    name: "trim",
    type: "boolean",
    default: "true",
    description: "Trim whitespace before committing a tag.",
  },
  {
    name: "delimiters",
    type: "string[]",
    default: '["Enter", ","]',
    description: "Keys that commit the current input as a tag.",
  },
  {
    name: "validate",
    type: "(tag, tags) => true | string",
    default: "—",
    description: "Custom validator; return an error message to reject.",
  },
  {
    name: "onTagAdd",
    type: "(tag: string) => void",
    default: "—",
    description: "Called after a tag is added successfully.",
  },
  {
    name: "onTagRemove",
    type: "(tag: string, index: number) => void",
    default: "—",
    description: "Called after a tag is removed.",
  },
  {
    name: "onValidationError",
    type: "(message: string) => void",
    default: "—",
    description: "Called when a tag is rejected by validation.",
  },
  {
    name: "aria-invalid",
    type: "boolean",
    default: "—",
    description: "Surfaces validation state to assistive tech and styling.",
  },
  {
    name: "name",
    type: "string",
    default: "—",
    description: "Adds a hidden input carrying JSON-encoded tags for form submission.",
  },
];

const TYPES_CODE = `type TagsInputProps = {
  value?: string[];
  defaultValue?: string[];
  onChange?: (value: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  maxTags?: number;
  minLength?: number;
  maxLength?: number;
  allowDuplicates?: boolean;
  trim?: boolean;
  delimiters?: string[];
  validate?: (tag: string, tags: string[]) => true | string;
  onTagAdd?: (tag: string) => void;
  onTagRemove?: (tag: string, index: number) => void;
  onValidationError?: (message: string) => void;
  "aria-invalid"?: boolean;
  name?: string;
};

type UseTagsInputOptions = {
  value?: string[];
  defaultValue?: string[];
  onChange?: (value: string[]) => void;
  maxTags?: number;
  minLength?: number;
  maxLength?: number;
  allowDuplicates?: boolean;
  trim?: boolean;
  validate?: (tag: string, tags: string[]) => true | string;
};

type UseTagsInputReturn = {
  tags: string[];
  setTags: (value: string[]) => void;
  addTag: (tag: string) => true | string;
  removeTag: (index: number) => void;
  clear: () => void;
};`;

function Section({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="px-4 py-8 sm:px-6 lg:px-8">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      {description && <p className="text-muted-foreground mt-1 text-sm">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Step({
  index,
  title,
  description,
  children,
}: {
  index: number;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative pl-9">
      <span className="bg-muted text-muted-foreground absolute top-0 left-0 inline-flex size-6 items-center justify-center rounded-md border font-mono text-xs">
        {index}
      </span>
      <h3 className="text-sm font-medium">{title}</h3>
      {description && <p className="text-muted-foreground mt-1 text-sm">{description}</p>}
      <div className="mt-3">{children}</div>
    </div>
  );
}

export default function TagsInputComponentPage() {
  return (
    <>
      <div
        aria-label="Section navigation"
        className="pointer-events-none fixed top-1/2 right-4 z-30 hidden -translate-y-1/2 xl:block"
      >
        <div className="pointer-events-auto">
          <TOCMinimap items={TOC} />
        </div>
      </div>
      <PageHeader title="Tags Input" />
      <article className="mx-auto flex w-full max-w-4xl flex-1 flex-col border-x">
        <div className="px-4 py-8 sm:px-6 lg:px-8">
          <p className="text-muted-foreground text-sm leading-relaxed">
            A composable tags input built on shadcn primitives. Supports controlled and uncontrolled
            modes, keyboard navigation, paste-splitting, custom validation, and form integration.
          </p>
        </div>
        <Separator />

        <Section id="demo" title="Demo" description="A controlled tags input.">
          <div className="rounded-lg border p-6">
            <BasicDemo />
          </div>
        </Section>
        <Separator />

        <Section
          id="install"
          title="Install"
          description="One command via the shadcn CLI, or copy the source manually."
        >
          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-medium">CLI</h3>
              <p className="text-muted-foreground mt-1 text-sm">
                Adds the file and resolves the registry dependency automatically.
              </p>
              <div className="mt-3">
                <TerminalBlock command={CLI_COMMAND} />
              </div>
              <details className="text-muted-foreground mt-3 text-xs">
                <summary className="cursor-pointer select-none">
                  Use the <code className="font-mono">@huanng/...</code> shorthand
                </summary>
                <p className="mt-2">
                  Requires registering the namespace in your{" "}
                  <code className="font-mono">components.json</code>:{" "}
                  <code className="font-mono">
                    {`"registries": { "@huanng": "${REGISTRY_URL.replace("shadcn-tags-input.json", "{name}.json")}" }`}
                  </code>
                </p>
                <div className="mt-3">
                  <TerminalBlock command={NAMESPACE_COMMAND} />
                </div>
              </details>
            </div>

            <Separator />

            <div>
              <h3 className="text-sm font-medium">Manual</h3>
              <p className="text-muted-foreground mt-1 text-sm">
                Four steps if you prefer to copy the file yourself.
              </p>
              <div className="mt-5 space-y-8">
                <Step
                  index={1}
                  title="Install dependencies"
                  description="Runtime libraries the component needs."
                >
                  <TerminalBlock command={DEPS_COMMAND} />
                </Step>
                <Step
                  index={2}
                  title="Add shadcn primitives"
                  description="Pulls in the badge component used by tags."
                >
                  <TerminalBlock command={SHADCN_DEPS_COMMAND} />
                </Step>
                <Step
                  index={3}
                  title="Copy the source"
                  description="Drop into components/shadcn-tags-input/tags-input.tsx."
                >
                  <CodeBlock code={TAGS_INPUT_SOURCE} language="tsx" />
                </Step>
                <Step
                  index={4}
                  title="Browse the repo"
                  description="Latest source, history, and issues live on GitHub."
                >
                  <a
                    href={REPO_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="border-border hover:bg-muted inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors"
                  >
                    <span className="font-mono text-xs">huanngdev/me</span>
                    <ExternalLink className="size-3.5" />
                  </a>
                </Step>
              </div>
            </div>
          </div>
        </Section>
        <Separator />

        <Section
          id="usage"
          title="Usage"
          description="Render with a controlled value and onChange handler."
        >
          <CodeBlock code={BASIC_USAGE_CODE} />
        </Section>
        <Separator />

        <Section
          id="hook"
          title="useTagsInput hook"
          description="Use the hook directly if you need state without rendering the component."
        >
          <CodeBlock code={HOOK_USAGE_CODE} />
        </Section>
        <Separator />

        <Section
          id="constrained"
          title="With constraints"
          description="Limit tag count, length, and surface validation errors inline."
        >
          <div className="rounded-lg border p-6">
            <ConstrainedDemo />
          </div>
        </Section>
        <Separator />

        <Section
          id="zod"
          title="Zod validation"
          description="Validate the final array with a Zod schema on submit."
        >
          <div className="space-y-6">
            <div className="rounded-lg border p-6">
              <ZodDemo />
            </div>
            <CodeBlock code={ZOD_USAGE_CODE} />
            <p className="text-muted-foreground text-sm leading-relaxed">
              The component itself enforces per-tag constraints at entry time (length, duplicates,
              max count). Use Zod to validate the <em>final</em> array shape on submit — e.g.
              require at least N tags, or constrain values against an enum. Pass{" "}
              <code className="font-mono text-xs">aria-invalid</code> when the schema rejects to
              apply the destructive ring.
            </p>
          </div>
        </Section>
        <Separator />

        <Section id="props" title="Props">
          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[180px]">Prop</TableHead>
                  <TableHead className="w-[220px]">Type</TableHead>
                  <TableHead className="w-[120px]">Default</TableHead>
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
          <CodeBlock code={TYPES_CODE} />
        </Section>
      </article>
    </>
  );
}
