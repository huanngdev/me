import { StripedPattern } from "../striped-pattern";
import { BackButton } from "./back-button";

interface PageHeaderProps {
  title: string;
}

export function PageHeader({ title }: PageHeaderProps) {
  return (
    <>
      <div className="relative w-full border-b">
        <div className="bg-background relative mx-auto w-full max-w-4xl border-x px-4 py-3 sm:px-6 lg:px-8">
          <BackButton />
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
