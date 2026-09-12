import { CodeXml, Film, Globe, type LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  IDENTITY,
  PROJECTS,
  PUBLIC_PORTFOLIO_URL,
  type ProjectEntry,
  type ProjectStatus,
} from "@repo/core/constants";
import { cn } from "@repo/core/lib/utils";

import { BackButton } from "@repo/core/components/layouts/back-button";
import { TechBadgeList } from "@repo/core/components/layouts/coding/tech-stack";
import { Reveal, Stagger, StaggerItem } from "@repo/core/components/reveal";
import { ProjectGallery } from "./gallery";

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

export const dynamicParams = false;

export function generateStaticParams() {
  return PROJECTS.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const project = (PROJECTS as readonly ProjectEntry[]).find((p) => p.slug === slug);
  if (!project) return {};
  const projectUrl = `/projects/${project.slug}`;

  return {
    title: project.name,
    description: project.description,
    alternates: { canonical: projectUrl },
    openGraph: {
      title: `${project.name} — Project by ${IDENTITY.fullName}`,
      description: project.description,
      type: "article",
      url: projectUrl,
    },
  };
}

export default async function ProjectDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const project = (PROJECTS as readonly ProjectEntry[]).find((p) => p.slug === slug);
  if (!project) notFound();

  const gallery = project.gallery ?? [];
  const projectUrl = `${PUBLIC_PORTFOLIO_URL}/projects/${project.slug}`;
  const projectJsonLd = {
    "@context": "https://schema.org",
    "@type": "CreativeWork",
    "@id": `${projectUrl}#project`,
    name: project.name,
    description: project.description,
    url: projectUrl,
    creator: { "@id": `${PUBLIC_PORTFOLIO_URL}/#person` },
    isPartOf: { "@id": `${PUBLIC_PORTFOLIO_URL}/#website` },
    keywords: project.stack,
    sameAs: [project.links.live, project.links.source].filter((url): url is string => Boolean(url)),
  };

  return (
    <>
      <article className="mx-auto flex w-full max-w-4xl flex-1 flex-col border-x">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(projectJsonLd).replace(/</g, "\\u003c"),
          }}
        />
        <div className="border-b px-4 py-3 sm:px-6 lg:px-8">
          <BackButton />
        </div>

        <Reveal>
          <header className="border-b px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                  {project.name}
                </h1>
                <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
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
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <IconCircle href={project.links.live} icon={Globe} label="Live site" />
                <IconCircle href={project.links.source} icon={CodeXml} label="Source code" />
                <IconCircle href={project.videoSrc} icon={Film} label="Demo video" />
              </div>
            </div>

            <div className="mt-4">
              <TechBadgeList items={project.stack} />
            </div>
          </header>
        </Reveal>

        {(project.videoSrc || gallery.length > 0) && (
          <Reveal>
            <div className="space-y-3 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
              {project.videoSrc && (
                <div className="bg-muted aspect-video w-full overflow-hidden rounded-md border">
                  <video
                    src={project.videoSrc}
                    controls
                    playsInline
                    preload="metadata"
                    className="size-full"
                  />
                </div>
              )}

              {gallery.length > 0 && <ProjectGallery items={gallery} />}
            </div>
          </Reveal>
        )}

        <div className="border-t px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
          {project.details ? (
            <Stagger className="space-y-6">
              <StaggerItem>
                <section>
                  <h2 className="text-lg font-semibold tracking-tight">Overview</h2>
                  <p className="text-muted-foreground mt-2 text-sm leading-relaxed sm:text-base">
                    {project.details.overview}
                  </p>
                </section>
              </StaggerItem>
              <StaggerItem>
                <section>
                  <h2 className="text-lg font-semibold tracking-tight">Features at a glance</h2>
                  <ul className="text-muted-foreground mt-2 list-disc space-y-2 pl-5 text-sm leading-relaxed sm:text-base">
                    {project.details.features.map((feat) => (
                      <li key={feat}>{feat}</li>
                    ))}
                  </ul>
                </section>
              </StaggerItem>
            </Stagger>
          ) : (
            <Reveal>
              <p className="text-base leading-relaxed">{project.description}</p>
            </Reveal>
          )}
        </div>

        <div className="flex-1" />
      </article>
    </>
  );
}

function IconCircle({
  href,
  icon: Icon,
  label,
}: {
  href?: string;
  icon: LucideIcon;
  label: string;
}) {
  const className =
    "border-border flex size-9 items-center justify-center rounded-full border transition-colors";
  if (!href) {
    return (
      <span
        aria-disabled
        aria-label={`${label} (unavailable)`}
        title={`${label} — not available`}
        className={cn(className, "text-muted-foreground/40 cursor-not-allowed")}
      >
        <Icon className="size-4" />
      </span>
    );
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      aria-label={label}
      title={label}
      className={cn(className, "text-foreground hover:bg-muted")}
    >
      <Icon className="size-4" />
    </a>
  );
}
