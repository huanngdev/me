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
import { SiteInfoSection } from "@repo/core/components/layouts/site-info-section";
import { StripedSeparator } from "@repo/core/components/layouts/striped-separator";
import { TocNav } from "@repo/core/components/layouts/toc-nav";
import { Reveal } from "@repo/core/components/reveal";
import { Separator } from "@repo/core/components/separator";
import { IDENTITY, PUBLIC_EMAIL, PUBLIC_PORTFOLIO_URL, SOCIAL_LINKS } from "@repo/core/constants";
import webPackage from "../../package.json";

const SITE_STACK = [
  `next@${webPackage.dependencies.next}`,
  `react@${webPackage.dependencies.react}`,
  `tailwindcss@${webPackage.devDependencies.tailwindcss.replace(/^\^/, "")}`,
] as const;

const personId = `${PUBLIC_PORTFOLIO_URL}/#person`;
const websiteId = `${PUBLIC_PORTFOLIO_URL}/#website`;
const profilePageId = `${PUBLIC_PORTFOLIO_URL}/#profile-page`;

const profileJsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": websiteId,
      url: `${PUBLIC_PORTFOLIO_URL}/`,
      name: IDENTITY.fullName,
      alternateName: ["Ngo Gia Huan", "huanngdev", "www.huanngdev.site"],
      inLanguage: "en",
      publisher: { "@id": personId },
    },
    {
      "@type": "ProfilePage",
      "@id": profilePageId,
      url: `${PUBLIC_PORTFOLIO_URL}/`,
      name: `${IDENTITY.fullName} (Ngo Gia Huan) — Fullstack Developer`,
      description: IDENTITY.description,
      inLanguage: "en",
      isPartOf: { "@id": websiteId },
      mainEntity: { "@id": personId },
      about: { "@id": personId },
    },
    {
      "@type": "Person",
      "@id": personId,
      name: IDENTITY.fullName,
      alternateName: ["Ngo Gia Huan", "huanngdev"],
      identifier: "huanngdev",
      url: `${PUBLIC_PORTFOLIO_URL}/`,
      image: {
        "@type": "ImageObject",
        url: `${PUBLIC_PORTFOLIO_URL}/images/ai-gen-avatar-light.webp`,
        contentUrl: `${PUBLIC_PORTFOLIO_URL}/images/ai-gen-avatar-light.webp`,
        caption: IDENTITY.fullName,
      },
      description: IDENTITY.description,
      jobTitle: "Freelance Fullstack Developer",
      email: `mailto:${PUBLIC_EMAIL}`,
      homeLocation: {
        "@type": "Place",
        name: `${IDENTITY.location.city}, ${IDENTITY.location.country}`,
      },
      alumniOf: {
        "@type": "CollegeOrUniversity",
        name: "FPT University",
      },
      knowsLanguage: IDENTITY.languages.map((language) => language.name),
      knowsAbout: ["TypeScript", "Next.js", "React", "Node.js", "Sui", "Move", "Web3"],
      sameAs: SOCIAL_LINKS.filter((link) =>
        ["github", "linkedin", "x", "facebook"].includes(link.platform),
      ).map((link) => link.url),
      mainEntityOfPage: { "@id": profilePageId },
    },
  ],
};

export default function Home() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(profileJsonLd).replace(/</g, "\\u003c"),
        }}
      />
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
        <ExperienceSection />
      </Reveal>
      <StripedSeparator height="h-12" />
      <Reveal>
        <EducationSection />
      </Reveal>
      <StripedSeparator height="h-12" />
      <Reveal>
        <ProjectsSection />
      </Reveal>
      <StripedSeparator height="h-12" />
      <Reveal>
        <AwardsSection />
      </Reveal>
      <StripedSeparator height="h-12" />
      <Reveal>
        <CertificationsSection />
      </Reveal>
      <StripedSeparator height="h-12" />
      <Reveal>
        <BookmarksSection />
      </Reveal>
      <StripedSeparator height="h-12" />
      <Reveal>
        <SiteInfoSection buildSha={process.env.VERCEL_GIT_COMMIT_SHA} stack={SITE_STACK} />
      </Reveal>
      <Footer />
    </>
  );
}
