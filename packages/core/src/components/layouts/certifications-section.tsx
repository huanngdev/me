"use client";

import type { CSSProperties } from "react";
import { useState } from "react";
import { useReducedMotion } from "framer-motion";
import { ArrowUpRight, BadgeCheckIcon, ChevronDown } from "lucide-react";
import { siCoursera, siEdx, siUdemy } from "simple-icons";

import {
  CERTIFICATIONS,
  type CertificationEntry,
  type CertificationPlatform,
} from "../../constants";
import { cn } from "../../lib/utils";
import { StaggerList, StaggerListItem } from "../reveal";
import { SectionHeading } from "./section-heading";

const VISIBLE_COUNT = 4;

type PlatformBrand = { path: string; color: string };

const PLATFORM_BRANDS: Partial<Record<CertificationPlatform, PlatformBrand>> = {
  coursera: { path: siCoursera.path, color: "#0056D2" },
  edx: { path: siEdx.path, color: "#02262B" },
  udemy: { path: siUdemy.path, color: "#A435F0" },
};

function formatCertDate(value: string): string {
  const [y, m] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, (m ?? 1) - 1, 1));
  return date.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
}

function PlatformBadge({ platform }: { platform?: CertificationPlatform }) {
  const brand = platform ? PLATFORM_BRANDS[platform] : undefined;

  if (!brand) {
    return (
      <div className="border-border bg-muted/30 text-muted-foreground flex size-10 shrink-0 items-center justify-center rounded-md border">
        <BadgeCheckIcon className="size-4" />
      </div>
    );
  }

  const style = { "--brand": brand.color } as CSSProperties;

  if (platform === "coursera") {
    return (
      <div
        style={style}
        className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full text-(--brand)"
      >
        <svg role="img" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d={brand.path} />
        </svg>
      </div>
    );
  }

  return (
    <div
      style={style}
      className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md text-(--brand)"
    >
      <svg role="img" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d={brand.path} />
      </svg>
    </div>
  );
}

export function CertificationsSection() {
  const items: ReadonlyArray<CertificationEntry> = CERTIFICATIONS;
  const [expanded, setExpanded] = useState(false);
  const reduceMotion = useReducedMotion();
  const canExpand = items.length > VISIBLE_COUNT;
  const visibleItems = expanded ? items : items.slice(0, VISIBLE_COUNT);

  return (
    <section id="certifications">
      <div className="mx-auto w-full max-w-4xl border-x">
        <SectionHeading title="Certifications" count={items.length} />

        {items.length === 0 ? (
          <p className="text-muted-foreground px-4 py-6 text-sm italic sm:px-6 sm:py-8 lg:px-8">
            No certifications listed yet.
          </p>
        ) : (
          <>
            <StaggerList layout={!reduceMotion} className="grid sm:grid-cols-2">
              {visibleItems.map((cert, index) => {
                const isLastOddItem =
                  !expanded && index === visibleItems.length - 1 && visibleItems.length % 2 === 1;
                const body = (
                  <div className="flex items-start gap-3">
                    <div className="origin-center transition-transform duration-200 ease-out group-hover:scale-105 group-hover:-rotate-3 motion-reduce:transition-none">
                      <PlatformBadge platform={cert.platform} />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start gap-2">
                        <h3 className="line-clamp-1 flex-1 text-sm font-semibold tracking-tight sm:text-base">
                          {cert.name}
                        </h3>
                        {cert.credentialUrl && (
                          <ArrowUpRight
                            className="text-muted-foreground mt-1 size-4 shrink-0 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                            aria-hidden="true"
                          />
                        )}
                      </div>
                      <p className="text-muted-foreground mt-0.5 line-clamp-1 text-sm">
                        {cert.issuer}
                      </p>
                      <p className="text-muted-foreground mt-1 font-mono text-[11px] tracking-wide uppercase">
                        Issued {formatCertDate(cert.date)}
                      </p>
                    </div>
                  </div>
                );

                return (
                  <StaggerListItem
                    key={`${cert.name}-${cert.date}`}
                    layout={!reduceMotion}
                    className={cn(
                      "border-b",
                      index % 2 === 0 && "sm:border-r",
                      isLastOddItem && "sm:col-span-2 sm:border-r-0",
                    )}
                  >
                    {cert.credentialUrl ? (
                      <a
                        href={cert.credentialUrl}
                        target="_blank"
                        rel="noreferrer noopener"
                        aria-label={`View ${cert.name} credential`}
                        className="group hover:bg-muted/30 flex h-full min-h-28 items-start gap-3 p-4 transition-colors duration-200 sm:p-5"
                      >
                        {body}
                      </a>
                    ) : (
                      <div className="group flex h-full min-h-28 items-start gap-3 p-4 sm:p-5">
                        {body}
                      </div>
                    )}
                  </StaggerListItem>
                );
              })}
            </StaggerList>

            {canExpand && (
              <button
                type="button"
                onClick={() => setExpanded((value) => !value)}
                aria-expanded={expanded}
                className="text-muted-foreground hover:bg-muted/30 hover:text-foreground flex w-full items-center justify-center gap-2 px-4 py-3 font-mono text-xs transition-colors duration-200"
              >
                {expanded ? "Show less" : `Show ${items.length - VISIBLE_COUNT} more`}
                <ChevronDown
                  className={cn(
                    "size-3.5 transition-transform duration-200 ease-out motion-reduce:transition-none",
                    expanded && "rotate-180",
                  )}
                  aria-hidden="true"
                />
              </button>
            )}
          </>
        )}
      </div>
    </section>
  );
}
