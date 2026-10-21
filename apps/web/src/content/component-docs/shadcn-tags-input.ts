import type { ComponentDocs } from "./types";

export const DOCS: ComponentDocs = {
  keywords: ["tags", "tag input", "chips", "pills", "input", "labels"],
  usage: `"use client";

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
}`,
  examples: [
    {
      title: "useTagsInput hook",
      description: "Use the hook directly if you need state without rendering the component.",
      code: `import { useTagsInput } from "@/components/shadcn-tags-input/tags-input";

const { tags, addTag, removeTag, clear } = useTagsInput({
  defaultValue: ["alpha"],
  maxTags: 5,
  minLength: 2,
});

const result = addTag("beta");
if (result !== true) console.error(result); // "Tag must be at least 2 characters"`,
    },
    {
      title: "With constraints",
      description: "Limit tag count, length, and surface validation errors inline.",
      code: `"use client";

import * as React from "react";
import { TagsInput } from "@/components/shadcn-tags-input/tags-input";

export function ConstrainedTagsInput() {
  const [tags, setTags] = React.useState<string[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  return (
    <div className="space-y-2">
      <TagsInput
        value={tags}
        onChange={(next) => {
          setTags(next);
          setError(null);
        }}
        maxTags={4}
        minLength={2}
        maxLength={16}
        onValidationError={setError}
        placeholder="Add up to 4 tags..."
      />
      {error && <p className="text-destructive text-xs">{error}</p>}
    </div>
  );
}`,
    },
    {
      title: "Zod validation",
      description: "Validate the final array with a Zod schema on submit.",
      code: `"use client";

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
}`,
    },
  ],
  props: [
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
    {
      name: "maxTags",
      type: "number",
      default: "—",
      description: "Maximum number of tags allowed.",
    },
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
  ],
  types: `type TagsInputProps = {
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
};`,
  notes: [],
};
