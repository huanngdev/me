interface SectionHeadingProps {
  title: string;
  count: number;
}

export function SectionHeading({ title, count }: SectionHeadingProps) {
  return (
    <header className="flex items-baseline gap-2.5 border-b px-4 py-4 sm:px-6 sm:py-5 lg:px-8">
      <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h2>
      <span
        className="text-muted-foreground font-mono text-xs tabular-nums"
        aria-label={`${count} ${title.toLowerCase()}`}
      >
        ({String(count).padStart(2, "0")})
      </span>
    </header>
  );
}
