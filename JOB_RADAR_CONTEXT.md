# Job Radar — Full Project Context

> Use this document to give any LLM complete context about the Job Radar project.
> It covers architecture, every file, database schema, API routes, current mock state,
> deployment setup, known issues, and development roadmap.

---

## What Is Job Radar?

Job Radar is an AI-powered job tracking application. Users upload a resume, and the app:
1. Parses it with Claude AI to extract skills, experience, and target roles
2. Monitors company career pages and ATS job boards (Greenhouse, Lever, Ashby) for new postings
3. Scores every posting 0–100 against the user's profile using Claude AI
4. Surfaces the best matches in a Bloomberg-terminal-style dashboard
5. Sends email alerts for high-scoring matches

The app has a subscription model (FREE / STARTER / PRO / UNLIMITED) with Stripe billing and a 14-day Pro trial for new users.

---

## Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| Frontend | Next.js 14 (App Router) + TypeScript | UI, API routes, auth |
| Styling | Tailwind CSS | Dark-mode-first design system |
| Auth | NextAuth.js v4 (JWT strategy + bcrypt) | Email/password authentication |
| Database | PostgreSQL + Prisma ORM v5 | All persistent data |
| AI | Anthropic Claude (claude-sonnet-4-20250514) | Resume parsing, match scoring, summaries |
| Backend | FastAPI (Python 3.11+) | Scraping, AI pipeline, scheduling |
| Scraping | Playwright (Python) | Career page scraping |
| Payments | Stripe Checkout + Customer Portal | Subscriptions |
| Email | Resend | Transactional email (alerts, digests) |
| Deployment | Railway (Nixpacks) | Two services + PostgreSQL plugin |

---

## Repository

- **GitHub:** https://github.com/adamabrahamson99-star/Job-Radar (public)
- **Local folder name:** "Job Radar"

---

## Deployment Architecture (Railway)

Three separate Railway resources:
1. **Next.js service** — root directory `/`, runs `npx prisma db push && npm start`
2. **FastAPI service** — root directory `/backend`, runs `uvicorn main:app --host 0.0.0.0 --port $PORT`
3. **PostgreSQL plugin** — managed database, auto-provides `DATABASE_URL`

Cross-service auth: Next.js API routes call FastAPI using `X-Internal-User-ID` and `X-Internal-Secret` headers (shared secret via `INTERNAL_API_SECRET` env var on both services). This avoids cross-origin cookie issues.

---

## Environment Variables

All defined in `.env.example`:

| Variable | Service | Description |
|---|---|---|
| `DATABASE_URL` | Both | PostgreSQL connection string (auto-provided by Railway) |
| `NEXTAUTH_SECRET` | Next.js | JWT signing secret |
| `NEXTAUTH_URL` | Next.js | Full app URL (e.g. `https://xxx.up.railway.app`) |
| `NEXT_PUBLIC_APP_URL` | Next.js | Same as NEXTAUTH_URL |
| `NEXT_PUBLIC_API_URL` | Next.js | FastAPI service URL (e.g. `https://yyy.up.railway.app`) |
| `INTERNAL_API_SECRET` | Both | Shared secret for Next.js → FastAPI internal calls |
| `ANTHROPIC_API_KEY` | FastAPI | Claude API key (blank = mock mode) |
| `PLAYWRIGHT_HEADLESS` | FastAPI | `true` for headless browser |
| `SCHEDULER_TIMEZONE` | FastAPI | `UTC` |
| `STRIPE_SECRET_KEY` | Next.js | Stripe secret key (blank = mock mode) |
| `STRIPE_WEBHOOK_SECRET` | Next.js | Stripe webhook signing secret |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Next.js | Stripe publishable key |
| `STRIPE_STARTER_MONTHLY_PRICE_ID` | Next.js | Stripe Price ID |
| `STRIPE_STARTER_ANNUAL_PRICE_ID` | Next.js | Stripe Price ID |
| `STRIPE_PRO_MONTHLY_PRICE_ID` | Next.js | Stripe Price ID |
| `STRIPE_PRO_ANNUAL_PRICE_ID` | Next.js | Stripe Price ID |
| `STRIPE_UNLIMITED_MONTHLY_PRICE_ID` | Next.js | Stripe Price ID |
| `STRIPE_UNLIMITED_ANNUAL_PRICE_ID` | Next.js | Stripe Price ID |
| `RESEND_API_KEY` | FastAPI | Resend API key (blank = mock mode) |
| `EMAIL_FROM` | FastAPI | Sender address for notifications |

---

## Current Mock State

All external services are currently mocked. No real API calls are made.

| Service | Mock Location | What It Returns |
|---|---|---|
| **Claude AI** | `backend/pipeline.py` | Hardcoded profile parse, random match score (55–97), fixed summary/explanation, cycling role categories |
| **Playwright scraper** | `backend/scraper.py` | 3 fake job postings per company with random titles/locations/salaries |
| **Greenhouse / Lever / Ashby** | `backend/ats_clients.py` | 5 fake postings per ATS source |
| **Resend email** | `backend/email_client.py` | `console.log("[MOCK EMAIL]", ...)` — no emails sent |
| **APScheduler** | `backend/scheduler.py` | Stub scheduler, no cron jobs — all tiers can manually trigger checks |
| **Stripe** | `src/app/api/billing/*.ts` | Checkout returns redirect to `?upgraded=true`, portal returns redirect to billing page, webhook is a no-op |

### Switching to Live Mode
Set the corresponding API key in env vars and replace the mock file with the real implementation:
1. Claude → set `ANTHROPIC_API_KEY`, replace functions in `backend/pipeline.py`
2. Stripe → set all `STRIPE_*` vars, replace billing route files
3. Resend → set `RESEND_API_KEY`, replace `_send()` in `backend/email_client.py`
4. Playwright → replace `backend/scraper.py` with real Playwright implementation
5. ATS APIs → replace `backend/ats_clients.py` with real HTTP calls
6. Scheduler → replace `backend/scheduler.py` with full APScheduler bootstrap

---

## Database Schema (Prisma)

### Tables

**users** — Auth + subscription info
- `id` (uuid PK), `email` (unique), `password_hash`, `full_name`
- `subscription_tier` (FREE | STARTER | PRO | UNLIMITED)
- `subscription_status` (ACTIVE | TRIALING | CANCELED | PAST_DUE)
- `trial_ends_at` (nullable), `stripe_customer_id` (nullable)
- `manual_checks_this_month` (int, resets on 1st), `manual_checks_reset_at`
- `onboarding_completed` (bool)

**candidate_profiles** — Parsed resume + user preferences (1:1 with users)
- `experience_level` (ENTRY | MID | SENIOR | STAFF), `years_of_experience`
- `skills[]`, `target_roles[]`, `education` (jsonb)
- `high_value_skills[]`, `high_value_titles[]` — boosted in match scoring
- `preferred_locations[]`
- `raw_resume_text`, `resume_file_path`

**companies** — User's watchlist (many per user)
- `company_name`, `career_page_url`, `is_active`, `last_checked_at`, `posting_count`

**job_postings** — All discovered jobs (many per user)
- `title`, `company_name`, `location`, `apply_url`
- `salary_min`, `salary_max`, `salary_currency`, `salary_raw`
- `description_raw`, `description_summary` (AI-generated)
- `match_score` (0–100), `match_explanation` (AI-generated)
- `experience_level`, `role_category`
- `source` (WATCHLIST | GREENHOUSE | LEVER | ASHBY)
- `status` (NEW | SAVED | APPLIED | NOT_INTERESTED)
- `is_new_since_last_visit`, `is_active` (false = taken down)
- `external_id` — SHA-256 fingerprint for dedup

**ats_companies** — Pre-seeded ATS company directory (105 companies)
- `source` (GREENHOUSE | LEVER | ASHBY), `company_slug`, `company_name`

**discovery_settings** — ATS discovery config per user (1:1)
- `greenhouse_enabled`, `lever_enabled`, `ashby_enabled`
- `location_keywords[]`, `role_keywords[]`

**notifications** — Sent notification log
- `type` (NEW_MATCH | WEEKLY_DIGEST | DAILY_DIGEST), `posting_ids[]`

**notification_preferences** — Email preferences per user (1:1)
- `email_enabled`, `instant_alert_threshold` (default 75)

---

## File Structure

### Next.js Frontend (`src/`)

```
src/
├── app/
│   ├── page.tsx                          # Root redirect (→ login or dashboard)
│   ├── layout.tsx                        # Root layout (fonts, providers)
│   ├── providers.tsx                     # SessionProvider + ToastProvider
│   ├── globals.css                       # Tailwind + Radar design tokens
│   │
│   ├── auth/
│   │   ├── login/page.tsx                # Login form + auto-seed trigger
│   │   └── register/page.tsx             # Registration + 14-day Pro trial
│   │
│   ├── onboarding/page.tsx               # 4-step wizard (Welcome → Resume → Priorities → Locations)
│   │
│   ├── dashboard/
│   │   ├── layout.tsx                    # DashboardShell wrapper (sidebar)
│   │   ├── page.tsx                      # Main job feed (filters, cards, pagination, stats)
│   │   ├── profile/page.tsx              # Profile editor + notification prefs
│   │   ├── sources/page.tsx              # Watchlist tab + Discovery tab
│   │   └── billing/page.tsx              # Plan card, pricing table, usage meters
│   │
│   └── api/
│       ├── auth/[...nextauth]/route.ts   # NextAuth handler
│       ├── auth/register/route.ts        # User registration
│       ├── seed/route.ts                 # Demo data seeder (dev only)
│       ├── profile/get/route.ts          # Get candidate profile
│       ├── profile/update/route.ts       # Update candidate profile
│       ├── profile/upload-resume/route.ts # Proxy → FastAPI resume upload
│       ├── companies/route.ts            # List + create companies (tier limits)
│       ├── companies/[id]/route.ts       # Update + delete company
│       ├── discovery/route.ts            # Get + save ATS discovery settings
│       ├── jobs/route.ts                 # Paginated job feed with filters
│       ├── jobs/[id]/status/route.ts     # Update job status (SAVED/APPLIED/etc.)
│       ├── jobs/stats/route.ts           # Dashboard stats (active, new, avg score)
│       ├── jobs/filter-options/route.ts  # Distinct role categories + locations
│       ├── jobs/manual-check/route.ts    # FREE tier manual check trigger
│       ├── jobs/mark-visited/route.ts    # Clear "new since last visit" flags
│       ├── billing/create-checkout-session/route.ts  # Mock Stripe checkout
│       ├── billing/portal-session/route.ts           # Mock Stripe portal
│       ├── billing/webhook/route.ts                  # Mock Stripe webhook
│       ├── notifications/preferences/route.ts        # Notification pref CRUD
│       └── onboarding/complete/route.ts              # Mark onboarding done
│
├── components/
│   ├── ui/
│   │   ├── Button.tsx                    # Primary/secondary/ghost/danger variants
│   │   ├── Input.tsx                     # Labeled input with error/hint
│   │   ├── TagInput.tsx                  # Tag-style multi-value input
│   │   ├── RadarLogo.tsx                 # SVG radar logo mark
│   │   ├── DashboardShell.tsx            # Sidebar + main layout + trial banner
│   │   ├── Toast.tsx                     # Toast notification system (provider + hook)
│   │   ├── TrialBanner.tsx               # "X days left in Pro trial" banner
│   │   └── UpgradePrompt.tsx             # Consistent lock/upgrade CTA component
│   ├── feed/
│   │   ├── JobCard.tsx                   # Job posting card (score badge, status, highlights)
│   │   └── FilterBar.tsx                 # Search, multi-select dropdowns, chip groups, sort
│   ├── onboarding/
│   │   ├── OnboardingWelcome.tsx         # Step 1: feature overview
│   │   ├── OnboardingResume.tsx          # Step 2: PDF upload → proxy → FastAPI
│   │   ├── OnboardingHighValue.tsx       # Step 3: priority skills/titles
│   │   └── OnboardingLocations.tsx       # Step 4: city tags + Remote/Hybrid toggles
│   └── sources/
│       ├── WatchlistTab.tsx              # Company table, add/edit/delete, manual check
│       └── DiscoveryTab.tsx              # ATS toggles, location/role keywords
│
├── lib/
│   ├── auth.ts                           # NextAuth config (JWT callbacks, Prisma lookup)
│   ├── prisma.ts                         # Prisma client singleton
│   ├── stripe.ts                         # Lazy Stripe client + PRICE_IDS map
│   ├── email.ts                          # Resend client + HTML email templates
│   ├── highlight.ts                      # High-value term highlighting utility
│   └── utils.ts                          # cn() classname helper, password validation
│
├── types/
│   ├── next-auth.d.ts                    # Session/JWT type extensions
│   └── jobs.ts                           # JobPosting, JobStats, JobFilters interfaces
│
└── middleware.ts                          # Route protection (dashboard, onboarding)
```

### FastAPI Backend (`backend/`)

```
backend/
├── main.py                    # FastAPI app, CORS, lifespan (auto-seed + scheduler)
├── database.py                # SQLAlchemy engine (lazy init from DATABASE_URL)
├── auth_utils.py              # Request auth: internal secret headers OR NextAuth JWT
├── pipeline.py                # MOCK: fingerprinting, dedup, AI scoring, summary
├── scraper.py                 # MOCK: 3 fake postings per company
├── ats_clients.py             # MOCK: 5 fake postings per ATS source
├── email_client.py            # MOCK: console.log instead of Resend
├── scheduler.py               # MOCK: stub scheduler, no cron jobs
├── jobs_runner.py             # check_user_jobs() — master orchestrator
├── seed_demo.py               # Demo data seeder (user, companies, 20 postings)
├── seed_ats.py                # ATS companies seeder (105 companies)
├── ats_seed_data.py           # ATS company list data
├── requirements.txt           # Python dependencies
├── railway.toml               # Railway deploy config for FastAPI
└── routers/
    ├── __init__.py
    ├── profile.py             # POST /api/profile/upload-resume, GET /api/profile/me
    └── jobs.py                # POST /api/jobs/run-check, POST /api/jobs/trigger-schedule-update
```

---

## Design System

- **Base:** `#0F1623` (deep navy)
- **Surface:** `#141C2E`, `#1A2338`, `#1F2A40`
- **Accent:** `#3B82F6` (electric blue)
- **Text:** `#F0F4FF` (primary), `#8B9ABF` (secondary), `#4A5878` (muted)
- **Display font:** Syne (headings)
- **Data font:** IBM Plex Mono (scores, stats, labels)
- **Body font:** Inter
- High-value tags render in electric blue; match score badges are color-graded (A=green, B=yellow, C=orange, D=gray)

---

## Tier System

| Feature | FREE | STARTER | PRO | UNLIMITED |
|---|---|---|---|---|
| Companies | 3 | 15 | 50 | ∞ |
| Check cadence | Manual only | Mon+Thu 7am UTC | Daily 7am UTC | Every 6h |
| Manual checks | 3/month | — | — | — |
| ATS discovery | No | 1 location | 3 locations | ∞ |
| Email digest | No | Weekly | Daily | Daily |
| Instant alerts | No | No | Yes | Yes |
| Price | Free | $9/mo | $19/mo | $34/mo |

New users get a **14-day Pro trial** (subscription_status = TRIALING). A daily cron checks for expired trials and downgrades to FREE.

---

## Demo Seed Data

When the database is empty, the app auto-seeds via:
- Next.js: `GET /api/seed` checks, `POST /api/seed` seeds
- FastAPI: `seed_demo.py` runs on startup

**Demo credentials:** `demo@radar.app` / `Demo1234!`

Seed includes:
- 1 user (Alex Chen, PRO tier, TRIALING, trial ends in 10 days)
- Candidate profile (ENTRY level, 1 year experience, 6 skills, 3 target roles)
- 5 watchlist companies (Google, Stripe, Notion, Airbnb, Linear)
- 20 job postings (match scores 45–96, mix of statuses, 8 marked as "new since last visit")
- Discovery settings (Remote + Denver, CO locations)

---

## Key Data Flows

### Resume Upload
`Browser → POST /api/profile/upload-resume (Next.js proxy) → POST FastAPI /api/profile/upload-resume → pdfplumber extracts text → Claude parses → upsert candidate_profiles`

### Manual Job Check
`Browser → POST /api/jobs/manual-check (Next.js) → POST FastAPI /api/jobs/run-check → scrape watchlist companies → run ATS discovery → AI score each new posting → insert job_postings → send email alerts if score ≥ threshold`

### Job Status Update
`Browser → PATCH /api/jobs/{id}/status (Next.js) → Prisma update → return updated posting`

### Stripe Checkout (when live)
`Browser → POST /api/billing/create-checkout-session → Stripe Checkout → webhook → update user tier → reschedule APScheduler`

---

## Known Issues / TODO

1. `backend/auth_utils.py` needs the updated version with `X-Internal-User-ID` / `X-Internal-Secret` support (fix pending deploy)
2. All external services are mocked — see "Switching to Live Mode" section above
3. The FastAPI backend's `seed_demo.py` auto-seed may fail if the DB schema hasn't been pushed yet (Prisma migration runs on Next.js service, not FastAPI)
4. Mobile responsive layout is basic — tablet (768px+) is functional, phone is stretch goal
5. No error boundary component yet (planned)
6. Playwright scraper mock doesn't test real pagination or cookie dismissal logic

---

## How to Give an LLM Context About This Project

Paste this entire document, then add your specific question. For code-level help, also share:
- The specific file(s) involved (copy from VS Code)
- Any error messages (full stack trace)
- Which service the error came from (Next.js build log vs FastAPI log vs browser console)
- Whether you're running locally or on Railway

The GitHub repo is public at: https://github.com/adamabrahamson99-star/Job-Radar
Any LLM with web access can read files directly from there.
