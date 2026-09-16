import { Pin } from "lucide-react";
import { siTypescript } from "simple-icons";

import { IDENTITY } from "../../constants";
import { Badge } from "../badge";
import { CopyButton } from "../copy-button";
import { ThemeAvatar } from "../theme-avatar";

const PINNED_ROLES = ["Frontend", "Backend", "Fullstack"] as const;

export function ProfileSection() {
  return (
    <section id="profile">
      <div className="mx-auto flex w-full max-w-4xl border-x">
        <div className="border-border relative size-28 shrink-0 overflow-hidden border-r sm:size-44">
          <ThemeAvatar />
        </div>

        <div className="flex flex-1 flex-col">
          <div className="border-border">
            <div className="flex items-center justify-start gap-2 px-4 py-2">
              <h1 className="-translate-y-px text-2xl font-semibold tracking-tight sm:text-3xl">
                {IDENTITY.displayName}
              </h1>
              <CopyButton text={IDENTITY.displayName} className="ml-2" />
            </div>

            <div className="flex flex-wrap items-center gap-1.5 border-y px-4 py-2">
              {PINNED_ROLES.map((role) => (
                <Badge key={role} variant="secondary" className="gap-1.5 pr-2!">
                  <Pin
                    data-icon="inline-start"
                    className="text-muted-foreground"
                    aria-hidden="true"
                  />
                  <span>{role}</span>
                  <svg data-icon="inline-end" viewBox="0 0 24 24" aria-label="TypeScript">
                    <path fill="currentColor" d={siTypescript.path} />
                  </svg>
                </Badge>
              ))}
            </div>
            <p className="text-muted-foreground hidden px-4 py-2 text-sm italic sm:block sm:text-sm">
              {IDENTITY.description}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
