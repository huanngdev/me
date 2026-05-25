import { GraduationCapIcon } from "lucide-react";

import { EDUCATION } from "../../constants";

const SCHOOL_LOGOS: Record<string, string> = {
  "FPT University": "/images/fpt-logo.svg",
};

const STATUS_LABEL: Record<string, string> = {
  graduated: "Graduated",
  "in-progress": "In progress",
};

function formatYearMonth(value: string): string {
  const [year, month] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, (month ?? 1) - 1, 1));
  return date.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
}

function formatRange(start: string, end: string | null): string {
  return `${formatYearMonth(start)} – ${end ? formatYearMonth(end) : "Present"}`;
}

export function EducationSection() {
  return (
    <section id="education">
      <div className="mx-auto w-full max-w-4xl border-x">
        <h2 className="border-b px-4 py-4 text-xl font-semibold tracking-tight sm:px-6 sm:py-5 sm:text-2xl lg:px-8">
          Education
        </h2>

        <ul className="divide-y">
          {EDUCATION.map((school) => (
            <li
              key={`${school.institution}-${school.start}`}
              className="px-4 py-4 sm:px-6 sm:py-5 lg:px-8"
            >
              <div className="flex items-start gap-3">
                <div className="bg-background text-muted-foreground flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md">
                  {SCHOOL_LOGOS[school.institution] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={SCHOOL_LOGOS[school.institution]}
                      alt={`${school.institution} logo`}
                      className="size-full object-contain p-1"
                    />
                  ) : (
                    <GraduationCapIcon className="size-4" />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <h3 className="text-sm font-semibold tracking-tight sm:text-base">
                      {school.institution}
                    </h3>
                    <span className="text-muted-foreground text-xs">
                      {STATUS_LABEL[school.status] ?? school.status}
                    </span>
                  </div>

                  <p className="text-muted-foreground mt-0.5 text-sm">
                    {school.degree} · {school.major}
                  </p>

                  <p className="text-muted-foreground mt-1 font-mono text-xs">
                    {formatRange(school.start, school.end)}
                    <span aria-hidden="true"> · </span>
                    {school.location}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
