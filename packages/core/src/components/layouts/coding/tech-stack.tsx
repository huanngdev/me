import type { CSSProperties } from "react";
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
import { cn } from "../../../lib/utils";

// Skills with no brand icon in simple-icons (Move, Walrus, Seal, Zustand, AWS)
// render as plain badges without a glyph.
const SKILL_ICONS: Record<string, { path: string; color: string; darkColor?: string }> = {
  TypeScript: { path: siTypescript.path, color: "#3178C6" },
  JavaScript: { path: siJavascript.path, color: "#F7DF1E", darkColor: "#F7DF1E" },
  "Next.js": { path: siNextdotjs.path, color: "#000000", darkColor: "#ffffff" },
  React: { path: siReact.path, color: "#61DAFB" },
  "Tailwind CSS": { path: siTailwindcss.path, color: "#06B6D4" },
  "shadcn/ui": { path: siShadcnui.path, color: "#000000", darkColor: "#ffffff" },
  "Framer Motion": { path: siFramer.path, color: "#0055FF" },
  "Node.js": { path: siNodedotjs.path, color: "#5FA04E" },
  Hono: { path: siHono.path, color: "#E36002" },
  PostgreSQL: { path: siPostgresql.path, color: "#4169E1" },
  Drizzle: { path: siDrizzle.path, color: "#C5F74F", darkColor: "#C5F74F" },
  Prisma: { path: siPrisma.path, color: "#2D3748", darkColor: "#ffffff" },
  MongoDB: { path: siMongodb.path, color: "#47A248" },
  Redis: { path: siRedis.path, color: "#FF4438" },
  ClickHouse: { path: siClickhouse.path, color: "#FFCC01", darkColor: "#FFCC01" },
  Supabase: { path: siSupabase.path, color: "#3FCF8E" },
  Firebase: { path: siFirebase.path, color: "#DD2C00" },
  MinIO: { path: siMinio.path, color: "#C72E49" },
  Docker: { path: siDocker.path, color: "#2496ED" },
  Vercel: { path: siVercel.path, color: "#000000", darkColor: "#ffffff" },
  Railway: { path: siRailway.path, color: "#0B0D0E", darkColor: "#ffffff" },
  "GitHub Actions": { path: siGithubactions.path, color: "#2088FF" },
  Sui: { path: siSui.path, color: "#4DA2FF" },
  Git: { path: siGit.path, color: "#F05032" },
  Figma: { path: siFigma.path, color: "#F24E1E" },
  Turborepo: { path: siTurborepo.path, color: "#EF4444" },
  Bun: { path: siBun.path, color: "#000000", darkColor: "#FBF0DF" },
  pnpm: { path: siPnpm.path, color: "#F69220" },
};

export function SkillIcon({ name, className }: { name: string; className?: string }) {
  const b = SKILL_ICONS[name];
  if (!b) return null;
  const style = {
    "--brand": b.color,
    "--brand-dark": b.darkColor ?? b.color,
  } as CSSProperties;
  return (
    <svg
      role="img"
      viewBox="0 0 24 24"
      fill="currentColor"
      style={style}
      className={cn("text-(--brand) dark:text-(--brand-dark)", className)}
      aria-hidden="true"
    >
      <path d={b.path} />
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
  const items = Array.from(new Set(SKILLS.flatMap((g) => g.items)));
  return <TechBadgeList items={items} />;
}
