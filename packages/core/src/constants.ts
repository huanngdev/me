/**
 * Single source of truth for personal/profile data used across the portfolio.
 * Mirrors `content/profile/*.md` — keep them in sync.
 */

// ---------- Identity ----------

export interface Identity {
  fullName: string;
  displayName: string;
  birthYear: number;
  birthDate: string;
  location: {
    city: string;
    country: string;
    timezone: string;
  };
  languages: ReadonlyArray<{ name: string; level: "native" | "fluent" | "conversational" }>;
  roles: ReadonlyArray<string>;
  tagline: string;
  description: string;
  availability: string;
}

export const IDENTITY = {
  fullName: "Ngô Gia Huấn",
  displayName: "Ngo Gia Huan",
  birthYear: 2003,
  birthDate: "2003-12-23",
  location: {
    city: "Ho Chi Minh City",
    country: "Vietnam",
    timezone: "Asia/Ho_Chi_Minh",
  },
  languages: [
    { name: "Vietnamese", level: "native" },
    { name: "English", level: "fluent" },
  ],
  roles: ["Fullstack Engineer", "Frontend Engineer", "Backend Engineer", "Blockchain Engineer"],
  tagline:
    "Fullstack engineer in Ho Chi Minh City. I build Next.js products in TypeScript — and occasionally wander into Sui blockchain.",
  description:
    "Self-taught fullstack developer shipping Next.js products in TypeScript, with a soft spot for hard UI work and the occasional hackathon.",
  availability: "Open to full-time and freelance work — available now.",
} as const satisfies Identity;

// ---------- Contact & social ----------

export type SocialPlatform = "github" | "linkedin" | "x" | "telegram" | "discord" | "facebook";

export interface SocialLink {
  platform: SocialPlatform;
  label: string;
  handle: string;
  url: string;
}

export const PUBLIC_EMAIL = "huanngdev@gmail.com";

export const PUBLIC_PHONE = "+84911685725";

export const REPO_URL = "https://github.com/huanngdev/me";

export const SOCIAL_LINKS = [
  {
    platform: "github",
    label: "GitHub",
    handle: "@huanngdev",
    url: "https://github.com/huanngdev",
  },
  {
    platform: "linkedin",
    label: "LinkedIn",
    handle: "huanngdev",
    url: "https://www.linkedin.com/in/huanngdev/",
  },
  {
    platform: "x",
    label: "x.com",
    handle: "@huanngdev",
    url: "https://x.com/huanngdev",
  },
  {
    platform: "telegram",
    label: "Telegram",
    handle: "@huanngdev",
    url: "https://t.me/huanngdev",
  },
  {
    platform: "discord",
    label: "Discord",
    handle: "huanngdev",
    url: "https://discord.com/users/huanngdev",
  },
  {
    platform: "facebook",
    label: "Facebook",
    handle: "huanngdev",
    url: "https://www.facebook.com/huanngdev/",
  },
] as const satisfies ReadonlyArray<SocialLink>;

// ---------- Tech stack ----------

export type SkillCategory = "languages" | "frontend" | "backend" | "infra" | "web3" | "tools";

export interface SkillGroup {
  category: SkillCategory;
  label: string;
  items: ReadonlyArray<string>;
}

export const SKILLS = [
  {
    category: "languages",
    label: "Languages",
    items: ["TypeScript", "JavaScript", "Move"],
  },
  {
    category: "frontend",
    label: "Frontend",
    items: ["Next.js", "React", "Tailwind CSS", "shadcn/ui", "Framer Motion", "Zustand"],
  },
  {
    category: "backend",
    label: "Backend & data",
    items: ["Node.js", "PostgreSQL", "Drizzle", "MongoDB", "Redis"],
  },
  {
    category: "infra",
    label: "Infra & deployment",
    items: ["Docker", "AWS", "Vercel", "Railway", "GitHub Actions"],
  },
  {
    category: "web3",
    label: "Web3",
    items: ["Sui", "Move", "Walrus", "Seal"],
  },
  {
    category: "tools",
    label: "Tools",
    items: ["Git", "Figma", "Turborepo", "Bun", "pnpm"],
  },
] as const satisfies ReadonlyArray<SkillGroup>;

// ---------- Education ----------

export type EducationStatus = "graduated" | "in-progress";

export interface EducationEntry {
  institution: string;
  degree: string;
  major: string;
  start: string;
  end: string | null;
  status: EducationStatus;
  location: string;
}

export const EDUCATION = [
  {
    institution: "FPT University",
    degree: "Bachelor",
    major: "Software Engineering",
    start: "2021-10",
    end: "2025-05",
    status: "graduated",
    location: "Vietnam",
  },
] as const satisfies ReadonlyArray<EducationEntry>;

// ---------- Experience ----------

export type EmploymentType = "full-time" | "part-time" | "contract" | "internship" | "freelance";

export interface ExperienceEntry {
  company: string;
  role: string;
  employmentType: EmploymentType;
  start: string;
  end: string | null;
  location: string;
  about?: string;
}

export const EXPERIENCE = [
  {
    company: "Formo",
    role: "Fullstack Developer",
    employmentType: "full-time",
    start: "2025-09",
    end: "2026-05",
    location: "Remote",
    about: "Web3 analytics / on-chain data product.",
  },
  {
    company: "FPT Software",
    role: "Software Engineer Intern",
    employmentType: "internship",
    start: "2024-09",
    end: "2025-05",
    location: "Ho Chi Minh City, Vietnam",
    about: "Web team — Next.js / React stack.",
  },
] as const satisfies ReadonlyArray<ExperienceEntry>;

// ---------- Projects ----------

export type ProjectStatus = "live" | "in-progress" | "demo" | "archived";

export interface ProjectEntry {
  name: string;
  description: string;
  stack: ReadonlyArray<string>;
  status: ProjectStatus;
  hackathon?: string;
  result?: string;
  links: {
    live?: string;
    source?: string;
    submission?: string;
  };
}

export const PROJECTS = [
  {
    name: "WalForm",
    description: "On-chain form builder on Sui — forms with decentralized storage on Walrus.",
    stack: ["Sui", "Walrus", "Move", "TypeScript", "Next.js"],
    status: "live",
    hackathon: "Walrus Session 2 — Form Tooling",
    links: {},
  },
  {
    name: "Sui Stream",
    description:
      "YouTube, on-chain — video streaming powered by Walrus storage and Sui smart contracts.",
    stack: ["Sui", "Move", "Walrus", "TypeScript", "Next.js"],
    status: "demo",
    hackathon: "CommandOSS HackerHouse",
    links: {},
  },
  {
    name: "Relic of Lie",
    description:
      "Decentralized take on the Love Letter card game — bluffing and deduction, on-chain.",
    stack: ["Sui", "Move"],
    status: "demo",
    hackathon: "First Mover",
    result: "Top 2",
    links: {},
  },
  {
    name: "Personal portfolio",
    description:
      "Personal portfolio built with Next.js 16, Tailwind v4, shadcn/ui in a Turborepo monorepo.",
    stack: ["Next.js", "Tailwind CSS", "shadcn/ui", "Framer Motion", "Turborepo"],
    status: "in-progress",
    links: { source: REPO_URL },
  },
] as const satisfies ReadonlyArray<ProjectEntry>;

// ---------- Awards & hackathons ----------

export interface AwardEntry {
  event: string;
  date: string;
  project: string;
  result: string;
}

export const AWARDS = [
  {
    event: "Walrus Session 2 — Form Tooling",
    date: "2026",
    project: "WalForm",
    result: "Participated",
  },
  {
    event: "CommandOSS HackerHouse",
    date: "2026-04-17",
    project: "Sui Stream",
    result: "Participated",
  },
  {
    event: "First Mover",
    date: "2026-02-03",
    project: "Relic of Lie",
    result: "Top 2",
  },
] as const satisfies ReadonlyArray<AwardEntry>;
