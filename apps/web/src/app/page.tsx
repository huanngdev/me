import { AwardsSection } from "@repo/core/components/layouts/awards-section";
import { BookmarksSection } from "@repo/core/components/layouts/bookmarks-section";
import { CertificationsSection } from "@repo/core/components/layouts/certifications-section";
import { CodingSection } from "@repo/core/components/layouts/coding/coding-section";
import { CoverSection } from "@repo/core/components/layouts/cover-section";
import { EducationSection } from "@repo/core/components/layouts/education-section";
import { ExperienceSection } from "@repo/core/components/layouts/experience-section";
import { Footer } from "@repo/core/components/layouts/footer";
import { OverviewSection } from "@repo/core/components/layouts/overview/overview-section";
import { ProfileSection } from "@repo/core/components/layouts/profile-section";
import { ProjectsSection } from "@repo/core/components/layouts/projects-section";
import { SocialLinksSection } from "@repo/core/components/layouts/social-links-section";
import { StripedSeparator } from "@repo/core/components/layouts/striped-separator";
import { TocNav } from "@repo/core/components/layouts/toc-nav";
import { ViewsSection } from "@repo/core/components/layouts/views/views-section";
import { Separator } from "@repo/core/components/separator";

import { recordView } from "../lib/actions/record-view";

export default function Home() {
  return (
    <>
      <TocNav />
      <CoverSection />
      <ProfileSection />
      <StripedSeparator height="h-12" />
      <OverviewSection />
      <Separator />
      <SocialLinksSection />
      <StripedSeparator height="h-12" />
      <CodingSection />
      <StripedSeparator height="h-12" />
      <ViewsSection recordAction={recordView} />
      <StripedSeparator height="h-12" />
      <ProjectsSection />
      <StripedSeparator height="h-12" />
      <ExperienceSection />
      <StripedSeparator height="h-12" />
      <EducationSection />
      <StripedSeparator height="h-12" />
      <CertificationsSection />
      <StripedSeparator height="h-12" />
      <AwardsSection />
      <StripedSeparator height="h-12" />
      <BookmarksSection />
      <Footer />
    </>
  );
}
