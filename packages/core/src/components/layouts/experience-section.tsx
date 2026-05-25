import { BriefcaseIcon } from "lucide-react";

import { EXPERIENCE } from "../../constants";

const COMPANY_LOGOS: Record<string, string> = {
  Formo: "/images/formo-logo.svg",
  "FPT Software": "/images/fpt-logo.svg",
};

const EMPLOYMENT_LABEL: Record<string, string> = {
  "full-time": "Full-time",
  "part-time": "Part-time",
  contract: "Contract",
  internship: "Internship",
  freelance: "Freelance",
};

function formatYearMonth(value: string): string {
  // value: "2025-09"
  const [year, month] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, (month ?? 1) - 1, 1));
  return date.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
}

function formatRange(start: string, end: string | null): string {
  const startLabel = formatYearMonth(start);
  const endLabel = end ? formatYearMonth(end) : "Present";
  return `${startLabel} – ${endLabel}`;
}

function diffDuration(start: string, end: string | null): string {
  const [sy, sm] = start.split("-").map(Number);
  const e = end ? end.split("-").map(Number) : null;
  const ey = e?.[0] ?? new Date().getUTCFullYear();
  const em = e?.[1] ?? new Date().getUTCMonth() + 1;
  const months = (ey - sy) * 12 + (em - sm) + 1;
  const years = Math.floor(months / 12);
  const remMonths = months % 12;
  if (years === 0) return `${months} mo`;
  if (remMonths === 0) return `${years} yr`;
  return `${years} yr ${remMonths} mo`;
}

export function ExperienceSection() {
  return (
    <section id="experience">
      <div className="mx-auto w-full max-w-4xl border-x">
        <h2 className="border-b px-4 py-4 text-xl font-semibold tracking-tight sm:px-6 sm:py-5 sm:text-2xl lg:px-8">
          Experience
        </h2>

        <ul className="divide-y">
          {EXPERIENCE.map((job) => (
            <li key={`${job.company}-${job.start}`} className="px-4 py-4 sm:px-6 sm:py-5 lg:px-8">
              <div className="flex items-start gap-3">
                <div className="bg-background text-muted-foreground flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md">
                  {COMPANY_LOGOS[job.company] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={COMPANY_LOGOS[job.company]}
                      alt={`${job.company} logo`}
                      className="size-full object-contain"
                    />
                  ) : (
                    <BriefcaseIcon className="size-4" />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <h3 className="text-sm font-semibold tracking-tight sm:text-base">
                      {job.company}
                    </h3>
                    <span className="text-muted-foreground text-xs">
                      {EMPLOYMENT_LABEL[job.employmentType] ?? job.employmentType}
                    </span>
                  </div>

                  <p className="text-muted-foreground mt-0.5 text-sm">{job.role}</p>

                  <p className="text-muted-foreground mt-1 font-mono text-xs">
                    {formatRange(job.start, job.end)}
                    <span aria-hidden="true"> · </span>
                    {diffDuration(job.start, job.end)}
                    <span aria-hidden="true"> · </span>
                    {job.location}
                  </p>

                  {job.about && (
                    <p className="text-muted-foreground mt-2 text-sm italic">{job.about}</p>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
