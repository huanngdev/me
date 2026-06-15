import {
  siBun,
  siClickhouse,
  siDocker,
  siDrizzle,
  siFigma,
  siFirebase,
  siFramer,
  siGit,
  siGithubactions,
  siHono,
  siJavascript,
  siMinio,
  siMongodb,
  siNextdotjs,
  siNodedotjs,
  siPnpm,
  siPostgresql,
  siPrisma,
  siRailway,
  siReact,
  siRedis,
  siShadcnui,
  siSui,
  siSupabase,
  siTailwindcss,
  siTurborepo,
  siTypescript,
  siVercel,
} from "simple-icons";

import { SKILLS } from "../../../constants";
import { Badge } from "../../badge";

// Skills with no brand icon in simple-icons (Move, Walrus, Seal, Zustand, AWS)
// render as plain badges without a glyph.
const SKILL_ICONS: Record<string, string> = {
  TypeScript: siTypescript.path,
  JavaScript: siJavascript.path,
  "Next.js": siNextdotjs.path,
  React: siReact.path,
  "Tailwind CSS": siTailwindcss.path,
  "shadcn/ui": siShadcnui.path,
  "Framer Motion": siFramer.path,
  "Node.js": siNodedotjs.path,
  Hono: siHono.path,
  PostgreSQL: siPostgresql.path,
  Drizzle: siDrizzle.path,
  Prisma: siPrisma.path,
  MongoDB: siMongodb.path,
  Redis: siRedis.path,
  ClickHouse: siClickhouse.path,
  Supabase: siSupabase.path,
  Firebase: siFirebase.path,
  MinIO: siMinio.path,
  Docker: siDocker.path,
  Vercel: siVercel.path,
  Railway: siRailway.path,
  "GitHub Actions": siGithubactions.path,
  Sui: siSui.path,
  Git: siGit.path,
  Figma: siFigma.path,
  Turborepo: siTurborepo.path,
  Bun: siBun.path,
  pnpm: siPnpm.path,
};

export function SkillIcon({ name, className }: { name: string; className?: string }) {
  const path = SKILL_ICONS[name];
  if (!path) return null;
  return (
    <svg
      role="img"
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d={path} />
    </svg>
  );
}

export function TechBadgeList({ items }: { items: ReadonlyArray<string> }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((name) => (
        <Badge key={name} variant="secondary" className="h-6 gap-1.5 px-2 text-xs">
          <SkillIcon name={name} className="size-3" />
          {name}
        </Badge>
      ))}
    </div>
  );
}

export function TechStack() {
  return (
    <>
      <h2 className="border-b px-4 py-4 text-xl font-semibold tracking-tight sm:px-6 sm:py-5 sm:text-2xl lg:px-8">
        Tech Stack
      </h2>
      <div className="divide-y">
        {SKILLS.map((group, i) => (
          <div
            key={group.category}
            className="grid grid-cols-1 gap-x-6 gap-y-3 px-4 py-4 sm:grid-cols-[180px_1fr] sm:px-6 sm:py-0 lg:px-8"
          >
            <div className="flex items-baseline gap-2 sm:border-r sm:py-5 sm:pr-6">
              <span className="text-muted-foreground font-mono text-xs tabular-nums">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="text-sm font-medium">{group.label}</span>
            </div>
            <div className="sm:py-5">
              <TechBadgeList items={group.items} />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
