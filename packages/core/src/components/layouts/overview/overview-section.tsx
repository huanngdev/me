import { ClockIcon, LanguagesIcon, MapPinIcon } from "lucide-react";

import { EXPERIENCE, IDENTITY, PUBLIC_EMAIL, PUBLIC_PHONE } from "../../../constants";
import { EmailItem } from "./email-item";
import { IntroItem, IntroItemContent, IntroItemIcon, IntroItemLink } from "./intro-item";
import { JobItem } from "./job-item";
import { PhoneItem } from "./phone-item";

const currentJob = EXPERIENCE[0];
const location = `${IDENTITY.location.city}, ${IDENTITY.location.country}`;
const languagesLabel = IDENTITY.languages.map((l) => l.name).join(", ");
const languagesAriaLabel = IDENTITY.languages.map((l) => `${l.name} (${l.level})`).join(", ");

export function OverviewSection() {
  return (
    <section id="overview">
      <div className="mx-auto max-w-4xl border-x px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <h2 className="sr-only">Overview</h2>

        <div className="grid gap-x-4 gap-y-2 sm:grid-flow-col sm:grid-cols-2 sm:grid-rows-3">
          <JobItem title={currentJob.role} company={currentJob.company} />

          <EmailItem email={PUBLIC_EMAIL} />

          <PhoneItem phoneNumber={PUBLIC_PHONE} />

          <IntroItem>
            <IntroItemIcon>
              <ClockIcon />
            </IntroItemIcon>
            <IntroItemContent aria-label="Timezone: UTC+7">
              UTC+7
              <span className="text-muted-foreground" aria-hidden="true">
                {" // Hanoi"}
              </span>
            </IntroItemContent>
          </IntroItem>

          <IntroItem>
            <IntroItemIcon>
              <MapPinIcon />
            </IntroItemIcon>
            <IntroItemContent>
              <IntroItemLink
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`}
                aria-label={`Location: ${location}`}
              >
                {location}
              </IntroItemLink>
            </IntroItemContent>
          </IntroItem>

          <IntroItem>
            <IntroItemIcon>
              <LanguagesIcon />
            </IntroItemIcon>
            <IntroItemContent aria-label={`Languages: ${languagesAriaLabel}`}>
              {languagesLabel}
            </IntroItemContent>
          </IntroItem>
        </div>
      </div>
    </section>
  );
}
