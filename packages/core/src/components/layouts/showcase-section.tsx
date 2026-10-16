import { ArrowUpRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { cn } from "../../lib/utils";
import { Button } from "../button";
import { CliCommand } from "../cli-command/cli-command";
import { StaggerList, StaggerListItem } from "../reveal";
import { BLOCK_COUNT, BLOCK_LIST } from "./blocks-section";
import { COMPONENT_COUNT, COMPONENT_LIST } from "./components-section";
import { SectionHeading } from "./section-heading";

const FEATURED_BLOCK = BLOCK_LIST.find((block) => block.slug === "notion-like-editor");
const FEATURED_COMPONENTS = COMPONENT_LIST.slice(0, 6);

export function ShowcaseSection() {
  return (
    <section id="showcase">
      <div className="mx-auto w-full max-w-4xl border-x">
        <SectionHeading title="Components & Blocks" count={COMPONENT_COUNT + BLOCK_COUNT} />

        {FEATURED_BLOCK && (
          <div className="grid gap-5 border-b px-4 py-5 sm:grid-cols-2 sm:items-center sm:gap-8 sm:px-6 lg:px-8">
            <Link
              href={`/blocks/${FEATURED_BLOCK.slug}`}
              className="group relative block overflow-hidden rounded-xl border"
            >
              <div className="relative aspect-video w-full overflow-hidden">
                <Image
                  src={FEATURED_BLOCK.snapshot.lightSrc}
                  alt={FEATURED_BLOCK.snapshot.alt}
                  fill
                  sizes="(min-width: 640px) 22rem, calc(100vw - 2rem)"
                  className="object-cover transition-transform duration-300 ease-out group-hover:scale-[1.02] motion-reduce:transition-none dark:hidden"
                />
                <Image
                  src={FEATURED_BLOCK.snapshot.darkSrc}
                  alt={FEATURED_BLOCK.snapshot.alt}
                  fill
                  sizes="(min-width: 640px) 22rem, calc(100vw - 2rem)"
                  className="hidden object-cover transition-transform duration-300 ease-out group-hover:scale-[1.02] motion-reduce:transition-none dark:block"
                />
              </div>
            </Link>

            <div className="flex min-w-0 flex-col gap-3">
              <p className="text-muted-foreground font-mono text-[11px] tracking-wider uppercase">
                Featured block
              </p>
              <h3 className="text-lg font-semibold tracking-tight">{FEATURED_BLOCK.name}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                A Plate-based block editor for shadcn/ui — slash menu, tables, media blocks, and
                autosave. Also published as richcn.
              </p>
              <CliCommand execute="shadcn@latest add https://www.huanngdev.site/r/notion-like-editor.json" />
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/blocks/${FEATURED_BLOCK.slug}`}>
                    Open demo
                    <ArrowUpRight />
                  </Link>
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <a href="https://richcn.huanngdev.site" target="_blank" rel="noreferrer noopener">
                    richcn docs
                    <ArrowUpRight />
                  </a>
                </Button>
              </div>
            </div>
          </div>
        )}

        <StaggerList className="grid grid-cols-2 sm:grid-cols-3">
          {FEATURED_COMPONENTS.map((comp, index) => {
            const Icon = comp.icon;
            return (
              <StaggerListItem
                key={comp.slug}
                className={cn(
                  "border-b",
                  index % 2 === 0 && "border-r",
                  index % 3 === 2 ? "sm:border-r-0" : "sm:border-r",
                )}
              >
                <Link
                  href={`/components/${comp.slug}`}
                  className="hover:bg-muted/30 flex h-full flex-col gap-2 p-4 transition-colors"
                >
                  <Icon className="text-muted-foreground size-4" aria-hidden="true" />
                  <span className="text-sm font-medium">{comp.name}</span>
                  <span className="text-muted-foreground line-clamp-1 text-xs">
                    {comp.description}
                  </span>
                </Link>
              </StaggerListItem>
            );
          })}
        </StaggerList>

        <div className="flex flex-col gap-3 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-6 lg:px-8">
          <p className="text-muted-foreground">
            Every component and block installs with one shadcn command.
          </p>
          <div className="flex shrink-0 items-center gap-4">
            <Link href="/components" className="hover:underline">
              All components →
            </Link>
            <Link href="/blocks" className="hover:underline">
              All blocks →
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
