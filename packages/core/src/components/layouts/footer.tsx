import { IDENTITY, REPO_URL } from "../../constants";
import { StripedPattern } from "../striped-pattern";

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="w-full border-t">
      <div className="relative h-14">
        <StripedPattern className="-z-10" />
        <div className="bg-background relative mx-auto flex h-full w-full max-w-4xl items-center justify-between gap-2 border-x px-4 sm:px-6 lg:px-8">
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
