import { PUBLIC_PORTFOLIO_URL, REPO_URL, SOCIAL_LINKS } from "../../constants";
import { COMPONENT_COUNT } from "./components-section";
import { SkillIcon } from "./coding/tech-stack";

const AUTHOR_URL = SOCIAL_LINKS.find((link) => link.platform === "github")?.url ?? REPO_URL;

const INSPIRED_BY = [
  { label: "chanhdai.com", url: "https://chanhdai.com/" },
  { label: "Tailwind CSS", url: "https://tailwindcss.com/" },
  { label: "shadcn/ui", url: "https://ui.shadcn.com/" },
  { label: "Vercel", url: "https://vercel.com/" },
] as const;

interface SiteInfoSectionProps {
  buildSha?: string;
  stack: ReadonlyArray<string>;
}

function InfoLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-muted-foreground font-mono text-xs font-medium tracking-wider uppercase">
      {children}
    </p>
  );
}

const linkClassName =
  "link-underline hover:text-foreground inline-flex items-center gap-2 transition-colors";

export function SiteInfoSection({ buildSha, stack }: SiteInfoSectionProps) {
  const buildId = buildSha?.slice(0, 7) ?? "local";
  const buildDate = new Date().toISOString().slice(0, 10);

  return (
    <section id="site-info" aria-labelledby="site-info-title">
      <div className="mx-auto w-full max-w-4xl border-x">
        <div className="flex flex-col gap-2 border-b px-4 py-5 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
          <h2 id="site-info-title" className="font-mono text-base font-semibold tracking-tight">
            <a className="link-underline" href={PUBLIC_PORTFOLIO_URL}>
              huanngdev.site
            </a>
          </h2>
          <p className="text-muted-foreground text-sm md:text-right">
            A fullstack developer portfolio and component registry.
          </p>
        </div>

        <div className="grid grid-cols-2 border-b md:grid-cols-4">
          <div className="space-y-2 border-r border-b px-4 py-5 sm:px-6 md:border-b-0 lg:px-8">
            <InfoLabel>Crafted by</InfoLabel>
            <a
              className={`${linkClassName} font-mono text-sm`}
              href={AUTHOR_URL}
              target="_blank"
              rel="noreferrer noopener"
            >
              @huanngdev
            </a>
          </div>
          <div className="space-y-2 border-b px-4 py-5 sm:px-6 md:border-r md:border-b-0 lg:px-8">
            <InfoLabel>Build</InfoLabel>
            {buildSha ? (
              <a
                className={`${linkClassName} font-mono text-sm`}
                href={`${REPO_URL}/commit/${buildSha}`}
                target="_blank"
                rel="noreferrer noopener"
              >
                {buildId}
              </a>
            ) : (
              <p className="font-mono text-sm">{buildId}</p>
            )}
          </div>
          <div className="space-y-2 border-r px-4 py-5 sm:px-6 lg:px-8">
            <InfoLabel>Date</InfoLabel>
            <p className="font-mono text-sm">{buildDate}</p>
          </div>
          <div className="space-y-2 px-4 py-5 sm:px-6 lg:px-8">
            <InfoLabel>Registry</InfoLabel>
            <p className="font-mono text-sm">
              {COMPONENT_COUNT} {COMPONENT_COUNT === 1 ? "item" : "items"}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 border-b md:grid-cols-4">
          <div className="space-y-2 border-r border-b px-4 py-5 sm:px-6 md:border-b-0 lg:px-8">
            <InfoLabel>Deployed on</InfoLabel>
            <a
              className={`${linkClassName} font-mono text-sm`}
              href={PUBLIC_PORTFOLIO_URL}
              target="_blank"
              rel="noreferrer noopener"
            >
              <SkillIcon name="Vercel" className="size-4" />
              Vercel
            </a>
          </div>
          <div className="space-y-2 border-b px-4 py-5 sm:px-6 md:border-r md:border-b-0 lg:px-8">
            <InfoLabel>Source code</InfoLabel>
            <a
              className={`${linkClassName} font-mono text-sm`}
              href={REPO_URL}
              target="_blank"
              rel="noreferrer noopener"
            >
              GitHub
            </a>
          </div>
          <div className="space-y-2 border-r px-4 py-5 sm:px-6 lg:px-8">
            <InfoLabel>License</InfoLabel>
            <a
              className={`${linkClassName} font-mono text-sm`}
              href={`${REPO_URL}#license`}
              target="_blank"
              rel="noreferrer noopener"
            >
              MIT License
            </a>
          </div>
          <div className="space-y-2 px-4 py-5 sm:px-6 lg:px-8">
            <InfoLabel>Typeface</InfoLabel>
            <p className="font-mono text-sm">Inter / JetBrains Mono</p>
          </div>
        </div>

        <div className="space-y-3 border-b px-4 py-5 sm:px-6 lg:px-8">
          <InfoLabel>Stack</InfoLabel>
          <ul className="space-y-1 font-mono text-sm">
            {stack.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>

        <div className="space-y-3 px-4 py-5 sm:px-6 lg:px-8">
          <InfoLabel>Inspired by</InfoLabel>
          <ol className="grid grid-cols-2 gap-x-5 gap-y-2 md:grid-cols-4">
            {INSPIRED_BY.map((item, index) => (
              <li key={item.url} className="flex min-w-0 items-baseline gap-2">
                <span className="text-muted-foreground font-mono text-xs tabular-nums">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <a
                  className="link-underline truncate text-sm"
                  href={item.url}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
