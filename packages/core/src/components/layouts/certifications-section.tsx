import type { CSSProperties } from "react";
import { ArrowUpRight, BadgeCheckIcon } from "lucide-react";
import { siCoursera, siEdx, siUdemy } from "simple-icons";

import {
  CERTIFICATIONS,
  type CertificationEntry,
  type CertificationPlatform,
} from "../../constants";
import { cn } from "../../lib/utils";

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
  const lastRowStart = items.length - (items.length % 2 || 2);

  return (
    <section id="certifications">
      <div className="mx-auto max-w-4xl border-x">
        <h2 className="border-b px-4 py-4 text-xl font-semibold tracking-tight sm:px-6 sm:py-5 sm:text-2xl lg:px-8">
          Certifications
        </h2>

        {items.length === 0 ? (
          <p className="text-muted-foreground px-4 py-6 text-sm italic sm:px-6 sm:py-8 lg:px-8">
            No certifications listed yet.
          </p>
        ) : (
          <ul className="grid grid-cols-2">
            {items.map((cert, i) => {
              const body = (
                <div className="flex items-start gap-3">
                  <PlatformBadge platform={cert.platform} />

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
                    <p className="text-muted-foreground mt-1 font-mono text-xs">
                      {formatCertDate(cert.date)}
                    </p>
                  </div>
                </div>
              );

              return (
                <li
                  key={`${cert.name}-${cert.date}`}
                  className={cn(i < lastRowStart && "border-b", i % 2 !== 1 && "border-r")}
                >
                  {cert.credentialUrl ? (
                    <a
                      href={cert.credentialUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      aria-label={`View ${cert.name} credential`}
                      className="group hover:bg-muted/40 flex h-full items-start gap-3 p-4 transition-colors"
                    >
                      {body}
                    </a>
                  ) : (
                    <div className="flex h-full items-start gap-3 p-4">{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
