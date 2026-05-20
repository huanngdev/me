---
title: Tech stack
updated: 2026-05-19
---

# Tech stack

Source of truth for the icon grid and recruiter SEO keywords. Only includes things Ngo Gia Huan can actually be tested on in an interview — no tutorial-only entries.

## Languages

- **TypeScript** — primary
- **JavaScript** — listed explicitly for keyword search
- **Move** — Sui smart contracts; the differentiator

## Frontend

- **Next.js** — App Router, RSC, server actions
- **React**
- **Tailwind CSS** — v4 (this project uses it)
- **shadcn/ui** — Radix primitives + custom styling
- **Framer Motion** — animations and interactions
- **Zustand** — client state

## Backend

- **Node.js** — with Express, Hono, or Fastify depending on the project
- **PostgreSQL** — with Drizzle or Prisma _(specify the preferred one before listing publicly)_
- **MongoDB**
- **Redis** — caching / pub-sub

## Infra & deployment

- **Docker**
- **AWS**
- **Vercel**
- **Railway**
- **CI/CD** — GitHub Actions

## Web3 / blockchain

- **Sui** — Move smart contracts
- **Walrus** — decentralized blob storage
- **Seal** — encryption / access primitive

These three together are the signature combo from the hackathon projects (SealPass, AfterVault). Lead with them in the Web3 section.

## Tools

- **Git + GitHub**
- **Figma** — design literacy; can read and implement designs
- **Turborepo** — monorepo orchestration (this project uses it)
- **Bun** — runtime + package manager
- **pnpm** — alternative package manager

## To clarify

- **"Mini"** — clarify what this refers to (Mini App framework? Telegram Mini App? Mini.js? Leaving out of the public list until confirmed.)
- **Drizzle vs Prisma** — list the one used more often; listing both reads like undecided. Recommend Drizzle (lighter, more idiomatic with TypeScript-first projects).

## Grouping for the icon grid

The CLAUDE.md tech stack section calls for loose grouping. Suggested:

1. **Languages** — TypeScript, JavaScript, Move
2. **Frontend** — Next.js, React, Tailwind, shadcn, Framer Motion, Zustand
3. **Backend & data** — Node.js, PostgreSQL, Drizzle (or Prisma), MongoDB, Redis
4. **Infra** — Docker, AWS, Vercel, Railway, GitHub Actions
5. **Web3** — Sui, Move, Walrus, Seal
6. **Tools** — Git, Figma, Turborepo, Bun, pnpm

Order matters — fullstack groups appear before Web3 so the casual recruiter sees the most relevant skills first; Web3 lands as the closer.
