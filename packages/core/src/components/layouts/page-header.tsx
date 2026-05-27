import type { ReactNode } from "react";
import { StripedPattern } from "../striped-pattern";
import { BackButton } from "./back-button";

interface PageHeaderProps {
  title: string;
  actions?: ReactNode;
}

export function PageHeader({ title, actions }: PageHeaderProps) {
  return (
    <>
      <div className="relative w-full border-b">
        <div className="bg-background relative mx-auto flex w-full max-w-4xl items-center gap-2 border-x px-4 py-3 sm:px-6 lg:px-8">
          <BackButton />
          {actions}
        </div>
      </div>

      <div className="relative w-full border-b">
        <StripedPattern className="-z-10" />
        <header className="bg-background relative mx-auto w-full max-w-4xl border-x px-4 py-6 sm:px-6 sm:py-4 lg:px-8">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        </header>
      </div>
    </>
  );
}
