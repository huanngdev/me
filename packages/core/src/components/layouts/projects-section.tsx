import { ArrowUpRight } from "lucide-react";
import Link from "next/link";

import { PROJECTS, type ProjectEntry, type ProjectStatus } from "../../constants";
import { cn } from "../../lib/utils";

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
  return (
    <section id="projects">
      <div className="mx-auto w-full max-w-4xl border-x">
        <h2 className="border-b px-4 py-4 text-xl font-semibold tracking-tight sm:px-6 sm:py-5 sm:text-2xl lg:px-8">
          Projects
        </h2>

        <ul className="divide-y">
          {(PROJECTS as readonly ProjectEntry[]).map((project) => (
            <li key={project.slug}>
              <Link
                href={`/projects/${project.slug}`}
                className="group hover:bg-muted/40 flex items-start gap-4 px-4 py-5 transition-colors sm:px-6 sm:py-6 lg:px-8"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <h3 className="text-base font-semibold tracking-tight sm:text-lg">
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
                    {project.hackathon && (
                      <span className="text-muted-foreground text-xs">· {project.hackathon}</span>
                    )}
                  </div>

                  <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
                    {project.description}
                  </p>
                </div>

                <ArrowUpRight className="text-muted-foreground mt-1 size-4 shrink-0 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
