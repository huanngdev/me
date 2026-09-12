import { ArrowUpRight } from "lucide-react";
import Link from "next/link";

import { PROJECTS, type ProjectEntry, type ProjectStatus } from "../../constants";
import { cn } from "../../lib/utils";
import { StaggerList, StaggerListItem } from "../reveal";
import { SectionHeading } from "./section-heading";

const STATUS_LABEL: Record<ProjectStatus, string> = {
  live: "Live",
  demo: "Demo",
  "in-progress": "In progress",
  archived: "Archived",
};

const STATUS_TONE: Record<ProjectStatus, string> = {
  live: "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  demo: "border-blue-500/40 bg-blue-500/10 text-blue-600 dark:text-blue-400",
  "in-progress": "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  archived: "border-border bg-muted/30 text-muted-foreground",
};

export function ProjectsSection() {
  const projects: ReadonlyArray<ProjectEntry> = PROJECTS;

  return (
    <section id="projects">
      <div className="mx-auto w-full max-w-4xl border-x">
        <SectionHeading title="Projects" count={projects.length} />

        <StaggerList className="grid sm:grid-cols-2">
          {projects.map((project, index) => {
            const isFeatured = index === 0;
            const isClosingWide = index === projects.length - 1 && (projects.length - 1) % 2 === 1;
            const isWide = isFeatured || isClosingWide;

            return (
              <StaggerListItem
                key={project.slug}
                className={cn(
                  "border-b",
                  !isWide && index % 2 === 1 && "sm:border-r",
                  isWide && "sm:col-span-2",
                )}
              >
                <Link
                  href={`/projects/${project.slug}`}
                  className={cn(
                    "group hover:bg-muted/30 relative flex h-full min-h-44 flex-col overflow-hidden px-4 py-5 transition-colors duration-200 sm:px-6 sm:py-6 lg:px-8",
                    isWide && "sm:min-h-48 sm:flex-row sm:items-end sm:justify-between sm:gap-10",
                  )}
                >
                  <span
                    className="bg-foreground absolute inset-y-0 left-0 w-px origin-bottom scale-y-0 transition-transform duration-200 ease-out group-hover:scale-y-100 motion-reduce:transition-none"
                    aria-hidden="true"
                  />

                  <div className="min-w-0 flex-1">
                    <div className="text-muted-foreground mb-6 flex items-center gap-2 font-mono text-[11px] tracking-wider uppercase">
                      <span>{String(index + 1).padStart(2, "0")}</span>
                      <span aria-hidden="true">/</span>
                      <span>{isFeatured ? "Featured work" : STATUS_LABEL[project.status]}</span>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
                      <h3
                        className={cn(
                          "font-semibold tracking-tight",
                          isWide ? "text-xl" : "text-lg",
                        )}
                      >
                        {project.name}
                      </h3>
                      <span
                        className={cn(
                          "rounded-md border px-1.5 py-0.5 text-[10px] font-medium tracking-wide uppercase",
                          STATUS_TONE[project.status],
                        )}
                      >
                        {STATUS_LABEL[project.status]}
                      </span>
                      {project.result && (
                        <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
                          {project.result}
                        </span>
                      )}
                    </div>

                    <p className="text-muted-foreground mt-2 max-w-2xl text-sm leading-relaxed">
                      {project.description}
                    </p>

                    {project.hackathon && (
                      <p className="text-muted-foreground mt-2 font-mono text-[11px]">
                        {project.hackathon}
                      </p>
                    )}
                  </div>

                  <div
                    className={cn(
                      "mt-6 flex items-end justify-between gap-4",
                      isWide && "sm:mt-0 sm:max-w-xs sm:flex-1",
                    )}
                  >
                    <ul
                      className="flex flex-wrap gap-1.5"
                      aria-label={`${project.name} technology stack`}
                    >
                      {project.stack.slice(0, 5).map((technology) => (
                        <li
                          key={technology}
                          className="bg-muted/50 text-muted-foreground rounded-md px-2 py-1 font-mono text-[10px]"
                        >
                          {technology}
                        </li>
                      ))}
                    </ul>

                    <span className="border-border bg-background flex size-8 shrink-0 items-center justify-center rounded-full border transition-transform duration-200 ease-out group-hover:translate-x-0.5 group-hover:-translate-y-0.5 motion-reduce:transition-none">
                      <ArrowUpRight className="size-4" aria-hidden="true" />
                    </span>
                  </div>
                </Link>
              </StaggerListItem>
            );
          })}
        </StaggerList>
      </div>
    </section>
  );
}
