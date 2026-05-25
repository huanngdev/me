"use client";

import * as React from "react";
import { z } from "zod";

import { TagsInput } from "@repo/core/components/shadcn-tags-input/tags-input";
import { Button } from "@repo/core/components/button";
import { Label } from "@repo/core/components/label";

export function BasicDemo() {
  const [tags, setTags] = React.useState<string[]>(["typescript", "next.js"]);
  return (
    <div className="space-y-2">
      <Label htmlFor="basic-tags">Skills</Label>
      <TagsInput
        id="basic-tags"
        value={tags}
        onChange={setTags}
        placeholder="Type and press Enter..."
      />
      <p className="text-muted-foreground font-mono text-xs">value: {JSON.stringify(tags)}</p>
    </div>
  );
}

export function ConstrainedDemo() {
  const [tags, setTags] = React.useState<string[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  return (
    <div className="space-y-2">
      <Label htmlFor="constrained-tags">Tags (max 4, 2–16 chars)</Label>
      <TagsInput
        id="constrained-tags"
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
}

const tagsSchema = z.object({
  tags: z
    .array(z.string().min(2, "min 2 chars").max(16, "max 16 chars"))
    .min(1, "Add at least one tag")
    .max(5, "Maximum 5 tags allowed"),
});

type TagsFormErrors = {
  tags?: string;
};

export function ZodDemo() {
  const [tags, setTags] = React.useState<string[]>([]);
  const [errors, setErrors] = React.useState<TagsFormErrors>({});
  const [submitted, setSubmitted] = React.useState<string[] | null>(null);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const result = tagsSchema.safeParse({ tags });
    if (!result.success) {
      const first = result.error.issues[0];
      setErrors({ tags: first?.message ?? "Invalid tags" });
      setSubmitted(null);
      return;
    }
    setErrors({});
    setSubmitted(result.data.tags);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="zod-tags">Topics</Label>
        <TagsInput
          id="zod-tags"
          value={tags}
          onChange={(next) => {
            setTags(next);
            if (errors.tags) setErrors({});
          }}
          maxTags={5}
          aria-invalid={Boolean(errors.tags)}
          placeholder="Enter 1–5 topics..."
        />
        {errors.tags && <p className="text-destructive text-xs">{errors.tags}</p>}
      </div>
      <Button type="submit" size="sm">
        Submit
      </Button>
      {submitted && (
        <p className="text-muted-foreground font-mono text-xs">
          Submitted: {JSON.stringify(submitted)}
        </p>
      )}
    </form>
  );
}
