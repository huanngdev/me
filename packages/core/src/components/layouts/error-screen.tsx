import type { ReactNode } from "react";

import { BackButton } from "@/components/layouts/back-button";
import { Footer } from "./footer";

export interface ErrorScreenProps {
  code: string | number;
  message: string;
  description?: string;
  action?: ReactNode;
}

export function ErrorScreen({ code, message, description, action }: ErrorScreenProps) {
  return (
    <div className="flex flex-1 flex-col">
      <section className="mx-auto flex w-full max-w-4xl flex-1 flex-col items-center justify-center gap-4 border-x px-4 py-16 text-center sm:px-6 lg:px-8">
        <p className="text-muted-foreground/80 font-mono text-6xl font-semibold tracking-tight sm:text-7xl">
          {code}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{message}</h1>
        {description && (
          <p className="text-muted-foreground max-w-md text-sm leading-relaxed sm:text-base">
            {description}
          </p>
        )}
        <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
          {action ?? <BackButton />}
        </div>
      </section>
      <Footer />
    </div>
  );
}
