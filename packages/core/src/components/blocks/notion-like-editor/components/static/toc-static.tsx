import { SlateElement, type SlateElementProps } from "platejs/static";

import { buttonVariants } from "@/components/button";
import { cn } from "@/lib/utils";

import { headingAnchorId } from "../elements/heading-styles";
import {
  TOC_UNTITLED,
  shallowestDepth,
  storedTocDepth,
  tocEntriesFromValue,
} from "../../lib/features/editor-toc-outline";

const TOC_INDENT_CLASS = ["ps-0", "ps-4", "ps-8"] as const;

function indentClass(level: number): string {
  if (level === 1) return TOC_INDENT_CLASS[1];
  if (level >= 2) return TOC_INDENT_CLASS[2];
  return TOC_INDENT_CLASS[0];
}

export function TocStatic(props: SlateElementProps) {
  const depth = storedTocDepth(props.element);
  const entries = tocEntriesFromValue(props.editor.children, depth);
  const shallowest = shallowestDepth(entries);
  return (
    <SlateElement {...props} className="group relative my-2 rounded-md">
      {entries.length === 0 ? null : (
        <nav aria-label="Table of contents" data-toc-depth={depth}>
          <ol className="m-0 list-none space-y-1 p-0">
            {entries.map((entry) => {
              const untitled = entry.title.length === 0;
              const label = untitled ? TOC_UNTITLED : entry.title;
              return (
                <li key={entry.id} className={indentClass(entry.depth - shallowest)}>
                  <a
                    href={`#${headingAnchorId(entry.id)}`}
                    data-slot="button"
                    data-variant="ghost"
                    data-size="sm"
                    data-toc-target={entry.id}
                    data-toc-indent={entry.depth - shallowest}
                    data-toc-untitled={untitled ? "true" : undefined}
                    className={cn(
                      buttonVariants({ variant: "ghost", size: "sm" }),
                      "h-auto w-full justify-start px-1 whitespace-normal",
                      untitled && "text-muted-foreground",
                    )}
                  >
                    {label}
                  </a>
                </li>
              );
            })}
          </ol>
        </nav>
      )}
      {props.children}
    </SlateElement>
  );
}
