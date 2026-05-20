import { ClockIcon, MapPinIcon } from "lucide-react";

import { EXPERIENCE, IDENTITY, PUBLIC_EMAIL, PUBLIC_PHONE, SOCIAL_LINKS } from "../../../constants";
import { EmailItem } from "./email-item";
import { IntroItem, IntroItemContent, IntroItemIcon, IntroItemLink } from "./intro-item";
import { JobItem } from "./job-item";
import { PhoneItem } from "./phone-item";

const currentJob = EXPERIENCE[0];
const website = SOCIAL_LINKS.find((s) => s.platform === "github")?.url ?? "";
const websiteLabel = website.replace(/^https?:\/\//, "");
const location = `${IDENTITY.location.city}, ${IDENTITY.location.country}`;

export function OverviewSection() {
  return (
    <section>
      <div className="mx-auto max-w-4xl border-x px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <h2 className="sr-only">Overview</h2>

        <div className="space-y-3">
          <JobItem title={currentJob.role} company={currentJob.company} />

          <div className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
            <EmailItem email={PUBLIC_EMAIL} />

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

            <PhoneItem phoneNumber={PUBLIC_PHONE} />
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
          </div>
        </div>
      </div>
    </section>
  );
}
