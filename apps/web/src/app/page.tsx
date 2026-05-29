import { AwardsSection } from "@repo/core/components/layouts/awards-section";
import { BookmarksSection } from "@repo/core/components/layouts/bookmarks-section";
import { CertificationsSection } from "@repo/core/components/layouts/certifications-section";
import { CodingSection } from "@repo/core/components/layouts/coding/coding-section";
import { CoverSection } from "@repo/core/components/layouts/cover-section";
import { EducationSection } from "@repo/core/components/layouts/education-section";
import { ExperienceSection } from "@repo/core/components/layouts/experience-section";
import { Footer } from "@repo/core/components/layouts/footer";
import { MapcnSection } from "@repo/core/components/layouts/mapcn-section";
import { OverviewSection } from "@repo/core/components/layouts/overview/overview-section";
import { ProfileSection } from "@repo/core/components/layouts/profile-section";
import { ProjectsSection } from "@repo/core/components/layouts/projects-section";
import { SocialLinksSection } from "@repo/core/components/layouts/social-links-section";
import { StripedSeparator } from "@repo/core/components/layouts/striped-separator";
import { TocNav } from "@repo/core/components/layouts/toc-nav";
import { ViewsSection } from "@repo/core/components/layouts/views/views-section";
import { Reveal } from "@repo/core/components/reveal";
import { Separator } from "@repo/core/components/separator";

import { recordView } from "../lib/actions/record-view";

export default function Home() {
  return (
    <>
      <TocNav />
      <CoverSection />
      <Reveal>
        <ProfileSection />
      </Reveal>
      <StripedSeparator height="h-12" />
      <Reveal>
        <OverviewSection />
      </Reveal>
      <Separator />
      <Reveal>
        <SocialLinksSection />
      </Reveal>
      <StripedSeparator height="h-12" />
      <Reveal>
        <CodingSection />
      </Reveal>
      <StripedSeparator height="h-12" />
      <Reveal>
        <ViewsSection recordAction={recordView} />
      </Reveal>
      <StripedSeparator height="h-12" />
      <Reveal>
        <ProjectsSection />
      </Reveal>
      <StripedSeparator height="h-12" />
      <Reveal>
        <ExperienceSection />
      </Reveal>
      <StripedSeparator height="h-12" />
      <Reveal>
        <EducationSection />
      </Reveal>
      <StripedSeparator height="h-12" />
      <Reveal>
        <CertificationsSection />
      </Reveal>
      <StripedSeparator height="h-12" />
      <Reveal>
        <AwardsSection />
      </Reveal>
      <StripedSeparator height="h-12" />
      <Reveal>
        <BookmarksSection />
      </Reveal>
      <StripedSeparator height="h-12" />
      <Reveal>
        <MapcnSection />
      </Reveal>
      <Footer />
    </>
  );
}
