---
name: frontend-dev-guidelines
description: Frontend development guidelines for Job Radar's Next.js 14 App Router + Tailwind CSS + TypeScript stack. Use when creating or modifying React components, pages, dashboard tabs, API route handlers, or working with NextAuth sessions, Prisma types, or the design system. Covers component patterns, Tailwind usage, API proxy routes, session auth, and the Job Radar design system (colors, fonts, score badges).
---

# Job Radar — Frontend Development Guidelines

> ⚠️ **Template Notice:** The `resources/` folder in this directory contains reference patterns from
> a MUI v7 / TanStack Router project. They are kept as structural references only. This SKILL.md is
> the canonical guide for Job Radar's Next.js 14 + Tailwind frontend. Always follow this file.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS (dark-mode-first) |
| Auth | NextAuth.js v4 (JWT + bcrypt) |
| ORM types | Prisma Client (TypeScript types) |
| Fonts | Syne (headings) · IBM Plex Mono (data) · Inter (body) |

---

## Directory Structure

```
src/
├── app/
│   ├── page.tsx                  — Root redirect (→ /dashboard)
│   ├── layout.tsx                — Root layout (providers, fonts)
│   ├── dashboard/                — Main dashboard (layout + pages)
│   │   ├── layout.tsx            — DashboardShell wrapper
│   │   └── ...
│   ├── auth/
│   │   ├── login/page.tsx
│   │   └── register/page.tsx
│   ├── onboarding/page.tsx
│   └── api/                      — Next.js API routes (proxy to FastAPI)
│       ├── auth/[...nextauth]/
│       ├── companies/
│       ├── jobs/
│       └── profile/
├── components/
│   ├── ui/                       — Shared primitives (Button, Input, Badge, etc.)
│   ├── sources/                  — Watchlist, ATS tabs
│   ├── jobs/                     — Job feed, job cards
│   └── profile/                  — Resume upload, candidate profile
└── lib/
    ├── auth.ts                   — NextAuth config + JWT callback + DEV_ACCOUNT_EMAILS
    ├── prisma.ts                 — Prisma singleton
    ├── highlight.ts              — Keyword highlighting (word-boundary regex)
    └── tier.ts                   — Tier limits (FREE/STARTER/PRO/UNLIMITED)
```

---

## Design System

### Colors (always use these — never introduce new values)
| Token | Value | Use |
|---|---|---|
| `bg-radar-base` | `#0F1623` | Page background |
| `bg-radar-surface` | `#141C2E` | Cards, panels |
| `bg-radar-panel` | `#1A2338` | Inner panels |
| `bg-radar-elevated` | `#1F2A40` | Elevated surfaces |
| `text-text-primary` | `#F0F4FF` | Primary text |
| `text-text-secondary` | `#8B9ABF` | Secondary/labels |
| `text-text-muted` | `#4A5878` | Muted/timestamps |
| `text-blue-400` / `bg-blue-500` | Electric blue | Accent, CTAs |

### Score badge colors
```tsx
// A (80+) = green, B (60-79) = yellow, C (40-59) = orange, D (<40) = gray
const scoreColor = score >= 80 ? "text-green-400" : score >= 60 ? "text-yellow-400" : score >= 40 ? "text-orange-400" : "text-gray-400";
```

### Fonts
```tsx
style={{ fontFamily: "Syne, sans-serif" }}        // headings
style={{ fontFamily: "IBM Plex Mono, monospace" }} // scores, stats
// Inter is the default body font via Tailwind
```

---

## Core Patterns

### "use client" vs Server Components
- Dashboard pages and components with state/events → `"use client"` at top
- Static layout wrappers and pages that only read session → Server Component (no directive)
- API routes in `src/app/api/` → always Server (no client directive)

### Session auth in Server Components
```typescript
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

const session = await getServerSession(authOptions);
if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
const userId = (session.user as any).id;
```

### Proxying to FastAPI (API routes)
All Next.js → FastAPI calls must include internal auth headers:
```typescript
const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/jobs/run-check`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-Internal-User-ID": userId,
    "X-Internal-Secret": process.env.INTERNAL_API_SECRET!,
  },
  signal: AbortSignal.timeout(10000),
});
```

### Tier checking
```typescript
import { getTierLimits } from "@/lib/tier";
const limits = getTierLimits(session.user.subscriptionTier);
```

### Highlight utility
```typescript
import { highlightKeywords } from "@/lib/highlight";
// Uses \b word-boundary regex — matches whole words only
const highlighted = highlightKeywords(text, prioritizedTerms);
```

---

## Component Conventions

- All interactive components: `"use client"` + `useState` / `useEffect`
- Props interfaces named `[ComponentName]Props`
- Event handlers named `handle[Action]` (e.g., `handleSubmit`, `handleDelete`)
- Loading states: boolean `loading` state + `disabled` + visual spinner or opacity
- Error states: string `error` state displayed inline near the triggering element
- No `any` types unless truly necessary (comment why if used)
- Tailwind only for styling — no inline style objects except for font-family overrides

---

## API Route Conventions (src/app/api/)

- Always validate session first, return 401 if missing
- Extract `userId` from `(session.user as any).id`
- Use Prisma for direct DB reads/writes when no FastAPI call needed
- Proxy to FastAPI for scraping, scoring, scheduling operations
- Always set `AbortSignal.timeout()` on fetch calls to FastAPI
- Return `NextResponse.json({ error: "..." }, { status: N })` for errors

---

## Anti-Patterns to Avoid

❌ Introducing new color values or font choices not in the design system
❌ Fetching from FastAPI directly from the browser (always proxy through Next.js API routes)
❌ Using `any` types without a comment explaining why
❌ Skipping session validation in API routes
❌ Using `router.push("/dashboard/profile")` — always push to `/dashboard`
❌ Hardcoding tier logic inline — use `getTierLimits()` from `@/lib/tier`
