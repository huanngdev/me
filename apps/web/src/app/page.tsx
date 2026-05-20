import { CoverSection } from "@repo/core/components/layouts/cover-section";
import { OverviewSection } from "@repo/core/components/layouts/overview/overview-section";
import { ProfileSection } from "@repo/core/components/layouts/profile-section";
import { SocialLinksSection } from "@repo/core/components/layouts/social-links-section";
import { StripedSeparator } from "@repo/core/components/layouts/striped-separator";
import { Separator } from "@repo/core/components/separator";

export default function Home() {
  return (
    <>
      <CoverSection />
      <ProfileSection />
      <StripedSeparator height="h-12" />
      <OverviewSection />
      <Separator />
      <SocialLinksSection />
      <StripedSeparator height="h-12" />
    </>
  );
}
