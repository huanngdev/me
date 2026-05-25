"use client";

import * as React from "react";
import { X } from "lucide-react";

import { Badge } from "../badge";
import { cn } from "../../lib/utils";

export type UseTagsInputOptions = {
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

export type UseTagsInputReturn = {
  tags: string[];
  setTags: (value: string[]) => void;
  addTag: (tag: string) => true | string;
  removeTag: (index: number) => void;
  clear: () => void;
};

export function useTagsInput({
  value,
  defaultValue,
  onChange,
  maxTags,
  minLength = 1,
  maxLength,
  allowDuplicates = false,
  trim = true,
  validate,
}: UseTagsInputOptions = {}): UseTagsInputReturn {
  const isControlled = value !== undefined;
  const [internal, setInternal] = React.useState<string[]>(defaultValue ?? []);
  const tags = isControlled ? value : internal;

  const commit = React.useCallback(
    (next: string[]) => {
      if (!isControlled) setInternal(next);
      onChange?.(next);
    },
    [isControlled, onChange],
  );

  const setTags = React.useCallback((next: string[]) => commit(next), [commit]);

  const addTag = React.useCallback(
    (raw: string): true | string => {
      const tag = trim ? raw.trim() : raw;
      if (tag.length < minLength)
        return `Tag must be at least ${minLength} character${minLength === 1 ? "" : "s"}`;
      if (maxLength && tag.length > maxLength) return `Tag must be at most ${maxLength} characters`;
      if (!allowDuplicates && tags.includes(tag)) return "Tag already exists";
      if (maxTags && tags.length >= maxTags) return `Maximum ${maxTags} tags allowed`;
      if (validate) {
        const result = validate(tag, tags);
        if (result !== true) return result;
      }
      commit([...tags, tag]);
      return true;
    },
    [tags, trim, minLength, maxLength, allowDuplicates, maxTags, validate, commit],
  );

  const removeTag = React.useCallback(
    (index: number) => {
      if (index < 0 || index >= tags.length) return;
      const next = tags.slice();
      next.splice(index, 1);
      commit(next);
    },
    [tags, commit],
  );

  const clear = React.useCallback(() => commit([]), [commit]);

  return { tags, setTags, addTag, removeTag, clear };
}

export type TagsInputProps = Omit<React.ComponentProps<"div">, "onChange" | "defaultValue"> &
  Pick<
    UseTagsInputOptions,
    | "value"
    | "defaultValue"
    | "onChange"
    | "maxTags"
    | "minLength"
    | "maxLength"
    | "allowDuplicates"
    | "trim"
    | "validate"
  > & {
    placeholder?: string;
    disabled?: boolean;
    delimiters?: string[];
    onTagAdd?: (tag: string) => void;
    onTagRemove?: (tag: string, index: number) => void;
    onValidationError?: (message: string) => void;
    "aria-invalid"?: boolean;
    name?: string;
  };

export function TagsInput({
  value,
  defaultValue,
  onChange,
  maxTags,
  minLength,
  maxLength,
  allowDuplicates,
  trim,
  validate,
  placeholder = "Add a tag...",
  disabled = false,
  delimiters = ["Enter", ","],
  onTagAdd,
  onTagRemove,
  onValidationError,
  className,
  name,
  "aria-invalid": ariaInvalid,
  ...props
}: TagsInputProps) {
  const { tags, addTag, removeTag } = useTagsInput({
    value,
    defaultValue,
    onChange,
    maxTags,
    minLength,
    maxLength,
    allowDuplicates,
    trim,
    validate,
  });
  const [input, setInput] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);

  const commitInput = (raw: string) => {
    if (!raw.trim()) return;
    const result = addTag(raw);
    if (result === true) {
      onTagAdd?.(trim === false ? raw : raw.trim());
      setInput("");
    } else {
      onValidationError?.(result);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (delimiters.includes(event.key)) {
      event.preventDefault();
      commitInput(input);
      return;
    }
    if (event.key === "Backspace" && input === "" && tags.length > 0) {
      const lastTag = tags[tags.length - 1];
      removeTag(tags.length - 1);
      onTagRemove?.(lastTag!, tags.length - 1);
    }
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = event.clipboardData.getData("text");
    if (!pasted.includes(",") && !pasted.includes("\n")) return;
    event.preventDefault();
    const parts = pasted
      .split(/[,\n]/)
      .map((p) => p.trim())
      .filter(Boolean);
    for (const part of parts) commitInput(part);
  };

  return (
    <div
      data-slot="tags-input"
      data-disabled={disabled || undefined}
      aria-invalid={ariaInvalid}
      onClick={() => inputRef.current?.focus()}
      className={cn(
        "border-input focus-within:border-ring focus-within:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:bg-input/30 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 flex min-h-8 w-full flex-wrap items-center gap-1 rounded-lg border bg-transparent px-1.5 py-1 text-sm transition-colors outline-none focus-within:ring-3 aria-invalid:ring-3 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50",
        className,
      )}
      {...props}
    >
      {tags.map((tag, i) => (
        <Badge key={`${tag}-${i}`} variant="secondary" className="data-[icon=inline-end]:pr-1">
          <span>{tag}</span>
          {!disabled && (
            <button
              type="button"
              data-icon="inline-end"
              aria-label={`Remove ${tag}`}
              onClick={(e) => {
                e.stopPropagation();
                removeTag(i);
                onTagRemove?.(tag, i);
              }}
              className="hover:bg-foreground/10 focus-visible:ring-ring/50 inline-flex size-3.5 items-center justify-center rounded-full transition-colors focus-visible:ring-2 focus-visible:outline-none"
            >
              <X className="size-2.5" />
            </button>
          )}
        </Badge>
      ))}
      <input
        ref={inputRef}
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        disabled={disabled}
        placeholder={tags.length === 0 ? placeholder : undefined}
        className="placeholder:text-muted-foreground min-w-[8ch] flex-1 bg-transparent px-1 py-0.5 text-sm outline-none disabled:cursor-not-allowed"
      />
      {name && <input type="hidden" name={name} value={JSON.stringify(tags)} />}
    </div>
  );
}
