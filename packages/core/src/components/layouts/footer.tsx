import { IDENTITY, REPO_URL } from "../../constants";
import { StripedPattern } from "../striped-pattern";

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t">
      <div className="relative">
        <StripedPattern className="-z-10" />
        <div className="bg-background mx-auto flex max-w-4xl flex-col gap-2 border-x px-4 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-6 lg:px-8">
          <p className="text-muted-foreground text-xs">
            © {year} {IDENTITY.displayName}. Built with Next.js.
          </p>
          <a
            href={REPO_URL}
            target="_blank"
            rel="noreferrer noopener"
            className="text-muted-foreground hover:text-foreground font-mono text-xs transition-colors"
          >
            View source ↗
          </a>
        </div>
      </div>
    </footer>
  );
}
