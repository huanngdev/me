/**
 * Single source of truth for personal/profile data used across the portfolio.
 * Mirrors `content/profile/*.md` — keep them in sync.
 */

import type { ComponentType } from "react";
import { Component, History, Home, NotebookText } from "lucide-react";

// ---------- Navigation ----------

export interface NavItem {
  label: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
}

export const NAV_ITEMS: NavItem[] = [
  { label: "Home", href: "/", icon: Home },
  { label: "Blog", href: "/blog", icon: NotebookText },
  { label: "Components", href: "/components", icon: Component },
  { label: "Changelog", href: "/changelog", icon: History },
];

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

export const PUBLIC_PORTFOLIO_URL = "https://huanngdev.site";

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
    items: [
      "Node.js",
      "Hono",
      "PostgreSQL",
      "Drizzle",
      "Prisma",
      "MongoDB",
      "Redis",
      "ClickHouse",
      "Supabase",
      "Firebase",
      "MinIO",
    ],
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
    location: "Ho Chi Minh City, Vietnam · On-site",
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

export interface ProjectGalleryItem {
  src: string;
  alt: string;
}

export interface ProjectDetails {
  overview: string;
  features: ReadonlyArray<string>;
}

export interface ProjectEntry {
  slug: string;
  name: string;
  description: string;
  details?: ProjectDetails;
  stack: ReadonlyArray<string>;
  status: ProjectStatus;
  hackathon?: string;
  result?: string;
  videoSrc?: string;
  gallery?: ReadonlyArray<ProjectGalleryItem>;
  links: {
    live?: string;
    source?: string;
    submission?: string;
  };
}

export const PROJECTS = [
  {
    slug: "walform",
    name: "WalForm",
    description: "On-chain form builder on Sui — forms with decentralized storage on Walrus.",
    details: {
      overview:
        "WalForm is a decentralized form builder that lives end-to-end on Sui + Walrus + Seal. Every form schema is a Sui object, every submission is a Seal-encrypted Walrus blob, every site can be deployed to its own Walrus Sites with a SuiNS name. Creators get a polished drag-and-drop builder; respondents get one-click submit with sponsored gas; no platform — including us — can read submissions or take a form down.",
      features: [
        "End-to-end Seal encryption — submissions encrypted in the browser before they touch Walrus. Private forms also encrypt the schema itself.",
        "One-click per-form Walrus Site deploy — no platform fee. Same outcome as paid services (e.g. Walgo); we take zero. Creator's wallet pays Walrus storage + Sui gas directly.",
        "SuiNS-friendly URLs. Default <base36>.wal.app/, link a name → your-brand.wal.app/. No formId in the URL.",
        "Four access modes: Public, allowlist Private, token-gated by Coin<T> balance, paid-per-submit in SUI.",
        "On-chain reviewers. Owner adds co-reviewer addresses; they decrypt the same submissions via a Seal whitelist policy. Perfect for judging panels and co-managed surveys.",
        "Sponsored gas with a graceful fallback via Enoki + a thin Edge Function; if it's down, the connected wallet pays — same code path, no error screen.",
        "Custom theme without code — 18 input field types, 8 web fonts, 11 accent palettes, 5 radii, card/page layout, Walrus-uploaded cover image.",
        "AI-assisted generation (BYOK OpenRouter) — describe the form, hydrate 18 field types onto the canvas client-side.",
        "Multi-wallet sign-in — Slush, Sui Wallet, any dApp-Kit wallet, or burner Google via Enoki zkLogin.",
        "Multi-buyer template marketplace with on-chain voting. Free clones cost nothing; paid clones route 10% royalty to the platform treasury. Upvote / downvote tracked on-chain (walform::voting).",
        "Results dashboard — aggregate charts per choice / rating / scale, by-question panel, decrypt-on-demand row table, CSV export, per-submitter private receipt.",
        "Walrus-backed file uploads — FILE_UPLOAD fields write bytes to Walrus via the user's wallet; the URL is sealed inside the encrypted submission body.",
        "Network-aware — testnet + mainnet swap from the wallet dropdown; all per-network ids resolved at runtime.",
      ],
    },
    stack: ["Sui", "Walrus", "Move", "TypeScript", "Next.js"],
    status: "live",
    hackathon: "Walrus Session 2 — Form Tooling",
    videoSrc: "https://5pv3zdt2hq.ufs.sh/f/snbdU3qJAUh1Fy4g439K6VeXNROMlJU8zbQ3wHtqh7C2Irni",
    gallery: [
      {
        src: "https://5pv3zdt2hq.ufs.sh/f/snbdU3qJAUh1LIREIvQOB07nQkh9Ytpb68XvuVRKFgSWocH5",
        alt: "WalForm screenshot 1",
      },
      {
        src: "https://5pv3zdt2hq.ufs.sh/f/snbdU3qJAUh1lym0pxoTtifjREvgzy6hcerI2H0P5BWqmb73",
        alt: "WalForm screenshot 2",
      },
      {
        src: "https://5pv3zdt2hq.ufs.sh/f/snbdU3qJAUh1TIdNHQ1FhRPB08Y3wOMleu7DtqLkAaNHQX9f",
        alt: "WalForm screenshot 3",
      },
      {
        src: "https://5pv3zdt2hq.ufs.sh/f/snbdU3qJAUh1rGAbx7HHQtDV7Bw4UYlApbq6WJMoxSTP1mvO",
        alt: "WalForm screenshot 4",
      },
      {
        src: "https://5pv3zdt2hq.ufs.sh/f/snbdU3qJAUh12ccBCxaUqCP01mhfR8GptKIyuznj5SbXAYlB",
        alt: "WalForm screenshot 5",
      },
    ],
    links: { source: "https://github.com/UyLeQuoc/sui-walform" },
  },
  {
    slug: "sui-stream",
    name: "Sui Stream",
    description:
      "YouTube, on-chain — video streaming powered by Walrus storage and Sui smart contracts.",
    stack: ["Sui", "Move", "Walrus", "TypeScript", "Next.js"],
    status: "demo",
    hackathon: "CommandOSS HackerHouse",
    links: {},
  },
  {
    slug: "personal-portfolio",
    name: "Personal portfolio",
    description:
      "Personal portfolio built with Next.js 16, Tailwind v4, shadcn/ui in a Turborepo monorepo.",
    stack: ["Next.js", "Tailwind CSS", "shadcn/ui", "Framer Motion", "Turborepo"],
    status: "in-progress",
    links: { source: REPO_URL },
  },
] as const satisfies ReadonlyArray<ProjectEntry>;

// ---------- Certifications ----------

export type CertificationPlatform = "coursera" | "udemy" | "edx" | "aws" | "google";

export interface CertificationEntry {
  name: string;
  issuer: string;
  platform?: CertificationPlatform;
  date: string;
  credentialUrl?: string;
}

export const CERTIFICATIONS = [
  {
    name: "User Experience Research and Design",
    issuer: "Coursera",
    platform: "coursera",
    date: "2024-05",
    credentialUrl: "https://coursera.org/share/2ad1c7065db757e6f538eff8bbb6de2e",
  },
  {
    name: "Project Management Principles and Practices",
    issuer: "Coursera",
    platform: "coursera",
    date: "2024-05",
    credentialUrl: "https://coursera.org/share/36c1782cc9cc3475e9272d827ab08773",
  },
  {
    name: "Academic English: Writing",
    issuer: "Coursera",
    platform: "coursera",
    date: "2024-01",
    credentialUrl: "https://coursera.org/share/ea0df8ebf21a5d3a869570ed5199e0b5",
  },
  {
    name: "CertNexus Certified Ethical Emerging Technologist",
    issuer: "Coursera",
    platform: "coursera",
    date: "2023-09",
    credentialUrl: "https://coursera.org/share/3c9c96daf64b42d71893639e0c7beca9",
  },
  {
    name: "Software Development Lifecycle",
    issuer: "Coursera",
    platform: "coursera",
    date: "2023-05",
    credentialUrl: "https://coursera.org/share/b0fcd4de7e010370363613e4dd7f62ef",
  },
  {
    name: "Web Design for Everybody: Basics of Web Development & Coding",
    issuer: "Coursera",
    platform: "coursera",
    date: "2023-01",
    credentialUrl: "https://coursera.org/share/79d19ae5c0597234dcf25fe299b017cf",
  },
  {
    name: "Computer Communications",
    issuer: "Coursera",
    platform: "coursera",
    date: "2022-09",
    credentialUrl: "https://coursera.org/share/510f58ad882fa5b852f78ba885c85f72",
  },
  {
    name: "Academic Skills for University Success",
    issuer: "Coursera",
    platform: "coursera",
    date: "2022-06",
    credentialUrl: "https://coursera.org/share/85381a65740b3b3dad28e05a35e94eb5",
  },
] as const satisfies ReadonlyArray<CertificationEntry>;

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
    result: "Top 1",
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

// ---------- Bookmarks ----------

export interface BookmarkEntry {
  title: string;
  source: string;
  url: string;
  date: string;
}

export const BOOKMARKS = [
  {
    title: "MapCN",
    source: "mapcn.dev",
    url: "https://www.mapcn.dev/",
    date: "2026-05-29",
  },
  {
    title: "Lucide Animated",
    source: "lucide-animated.com",
    url: "https://lucide-animated.com/",
    date: "2026-05-22",
  },
  {
    title: "Get Design",
    source: "getdesign.md",
    url: "https://getdesign.md/",
    date: "2026-05-22",
  },
  {
    title: "Logo Lattice",
    source: "logolattice.com",
    url: "https://logolattice.com/",
    date: "2026-05-22",
  },
  {
    title: "Transitions",
    source: "transitions.dev",
    url: "https://transitions.dev/",
    date: "2026-05-22",
  },
  {
    title: "BG Faster",
    source: "bg.faster.asia",
    url: "https://bg.faster.asia/",
    date: "2026-05-24",
  },
  {
    title: "Chanh Dai",
    source: "chanhdai.com",
    url: "https://chanhdai.com/",
    date: "2026-05-24",
  },
  {
    title: "Sleek Demo",
    source: "sleekdemo.com",
    url: "https://www.sleekdemo.com/",
    date: "2026-05-24",
  },
] as const satisfies ReadonlyArray<BookmarkEntry>;

// ---------- Changelog ----------

export interface ChangelogEntry {
  date: string; // YYYY-MM-DD
  changes: ReadonlyArray<string>;
}

// Curated from git history — big milestones only. Newest first.
export const CHANGELOG = [
  {
    date: "2026-05-23",
    changes: [
      "Added this changelog page — a timeline of big milestones, linked from the header.",
      "Added a ⌘K command palette with section navigation, project search, social links, and quick actions.",
      "Shipped a page-view counter backed by Drizzle and Redis dedup, with a cumulative views chart.",
      "Animated dotted world map on the cover, marking Ho Chi Minh City.",
      "Typing animation cycling through roles in the profile section.",
      "Root-level error boundary so failures land softly instead of a blank screen.",
    ],
  },
  {
    date: "2026-05-22",
    changes: ["Added a bookmarks section — a public reading log of tools and resources."],
  },
  {
    date: "2026-05-21",
    changes: [
      "Dedicated project detail pages with image galleries, zoom, and richer descriptions.",
      "Profile download menu — export the resume as PDF, Markdown, or JSON.",
      "Experience, education, certifications, and awards sections, plus a table-of-contents minimap.",
      "Full SEO pass — metadata, OG image, sitemap, robots.txt, and llms.txt.",
      "Top scroll progress bar and a sound engine wired to the @soundcn registry.",
    ],
  },
  {
    date: "2026-05-20",
    changes: [
      "Hero cover, profile, overview, and social-links sections built out.",
      "Coding section with a GitHub contribution heatmap and activity stats.",
      "New sticky header with theme toggle and profile constants.",
      "Dropped i18n entirely — the site is now English-only.",
    ],
  },
  {
    date: "2026-05-19",
    changes: [
      "Turborepo + Next.js scaffold with a shared `@repo/core` package.",
      "Husky, lint-staged, commitlint, and GitHub Actions CI.",
      "Canonical profile data lives in `content/profile/*.md`.",
    ],
  },
] as const satisfies ReadonlyArray<ChangelogEntry>;
