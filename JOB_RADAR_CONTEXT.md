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

Some services are now live. The table below reflects the current state.

| Service | Status | File | Notes |
|---|---|---|---|
| **Claude AI** | ✅ Live | `backend/pipeline.py` | Single combined API call per job: parse + score + summary. Auto-falls back to mock if `ANTHROPIC_API_KEY` is unset |
| **Playwright scraper** | ✅ Live | `backend/scraper.py` | Real Playwright implementation — see scraper details below |
| **Greenhouse API** | ✅ Live | `backend/ats_clients.py` | Real HTTP calls to `boards-api.greenhouse.io` |
| **Lever API** | ✅ Live | `backend/ats_clients.py` | Real HTTP calls to `api.lever.co` |
| **Ashby API** | ✅ Live | `backend/ats_clients.py` | Real GraphQL calls to `jobs.ashbyhq.com/api/non-user-graphql` |
| **Resend email** | ✅ Live | `backend/email_client.py` | Real Resend REST API calls; mock fallback when `RESEND_API_KEY` absent |
| **APScheduler** | ❌ Mock | `backend/scheduler.py` | Stub only, no cron jobs run |
| **Stripe** | ✅ Live | `src/app/api/billing/*.ts` | Real Checkout sessions, Customer Portal, and webhook with signature verification |

### Playwright Scraper — How It Works

`backend/scraper.py` is a full multi-layer Playwright implementation. **No fixed collection cap** — all discovered jobs are returned and filtered downstream.

#### Job Detection — 5-layer approach

1. **JSON-LD (Layer 1)** — Parses `<script type="application/ld+json">` on the listing page for `JobPosting` schema. Fastest and most accurate when available; immediately returns if 2+ jobs found.
2. **URL Clustering (Layer 2)** — Groups all candidate links by URL shape (`_url_template()` normalises numeric IDs → `{id}`, UUID → `{id}`, hyphenated slugs with `len > 8` → `{slug}`). Clusters of 3+ identical templates are accepted as job listing links. Falls back to threshold of 2 if no 3-cluster forms.
3. **DOM Parent Grouping (Layer 3)** — Uses Playwright `evaluate` to get each link's parent container class; groups of 2+ sharing the same container class are accepted.
4. **Base-path child check (Layer 4)** — Links that are sub-paths of the career page base URL are accepted as supplementary signals.
5. **Content sampling validation (Layer 5)** — Fetches one candidate URL and checks for 8 job-page signals (Apply button, job description section, etc.) to confirm the cluster is genuinely a job listing.

#### Pagination — unlimited jobs

After Playwright loads the first page (with dynamic scroll + load-more clicking), the scraper detects URL-pattern pagination (`?page=N`, `?start=N`, `/jobs/page/N`, etc.) and fires parallel `httpx` fetches for all remaining pages. Each batch filters links against the known URL templates found on page 1, with early termination when a batch returns no new links.

- **`_scroll_to_load_dynamic()`** — Scrolls until link count stabilises between rounds (replaces fixed-step scroll)
- **`_click_load_more()`** — Click loop on 12 known load-more button selectors, stops when no new content appears
- **`_fetch_paginated_links()`** — Parallel httpx batches; stops at first empty batch

#### Additional scraper features
- Dismisses cookie banners / consent overlays automatically (17 known selectors)
- Detects iframe-based career pages (Workday, iCIMS, Taleo, SuccessFactors)
- `preview_career_page(url)` — lightweight page-1-only scrape used at company-add time; returns `{status, job_count, samples, message}` for UI feedback
- Uses a realistic Chrome user-agent string to reduce bot detection
- Location enrichment: JSON-LD on listing page → DOM heuristics → async concurrent httpx fetches of individual job pages → `"See posting"` fallback

#### Title pre-filter (cost gate replacing collection cap)

`backend/pipeline.py` runs `_title_matches_profile(title, profile)` before the Claude API call. If the job title shares zero keywords with the candidate's `target_roles` + `high_value_titles`, the posting is still inserted but assigned a default score of 5 without spending an API call. This replaces the old 50-job cap as the cost control mechanism for large company watchlists.

**Railway build requirement:** `backend/railway.toml` includes `buildCommand = "pip install -r requirements.txt && playwright install chromium --with-deps"` to install the Chromium browser binary during deployment.

### ATS API Clients — How They Work

`backend/ats_clients.py` makes real HTTP calls to public job board APIs (no auth required):

- **Greenhouse:** `GET https://boards-api.greenhouse.io/v1/boards/{slug}/jobs?content=true` — returns `absolute_url` (per-job link), location, description HTML, and `updated_at`
- **Lever:** `GET https://api.lever.co/v0/postings/{slug}?mode=json` — returns `hostedUrl` (per-job link), categories (location/team), description, and `createdAt` epoch ms
- **Ashby:** `POST https://jobs.ashbyhq.com/api/non-user-graphql` with a GraphQL query — returns `externalLink` (per-job link), `locationName`, `descriptionHtml`, and `publishedDate`

All three strip HTML from descriptions and normalise date formats before returning.

### apply_url Behaviour

The `apply_url` field stored in `job_postings` is always a direct link to the specific job posting page — not the general careers page. This is what the "View & Apply" button links to in the dashboard.

- **Watchlist companies (Playwright):** `apply_url` = the exact href extracted from each job listing link on the career page
- **Greenhouse:** `apply_url` = `absolute_url` from the API (e.g. `https://boards.greenhouse.io/company/jobs/12345`)
- **Lever:** `apply_url` = `hostedUrl` from the API (e.g. `https://jobs.lever.co/company/uuid`)
- **Ashby:** `apply_url` = `externalLink` from the API, or `https://jobs.ashbyhq.com/{slug}/{id}` if no external link

**Seed data note:** `backend/seed_demo.py` uses `p["url"]` (the company's careers page root) as `apply_url` for demo postings since there are no real job IDs to link to. This is intentional for demo mode only.

### Switching Remaining Services to Live Mode

| Step | Service | Action |
|---|---|---|
| ~~1~~ | ~~Claude AI~~ | ✅ Done — `ANTHROPIC_API_KEY` triggers live mode automatically. Single combined call handles parse + score + summary. |
| ~~3~~ | ~~Resend~~ | ✅ Done — `RESEND_API_KEY` triggers live mode automatically. Real Resend REST API calls via `httpx`. HTML templates ported from `src/lib/email.ts`. |
| ~~2~~ | ~~Stripe~~ | ✅ Done — real Checkout sessions, Customer Portal, and webhook handler. Webhook verifies Stripe signature and updates `subscription_tier` + `subscription_status` in the DB on `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, and `invoice.payment_failed`. |
| 4 | Scheduler | Replace `backend/scheduler.py` stub with full APScheduler bootstrap (Mon+Thu for Starter, daily for Pro, every 6h for Unlimited). Stagger checks across a 2h window to avoid simultaneous Playwright load. |

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
│       ├── billing/create-checkout-session/route.ts  # LIVE Stripe checkout
│       ├── billing/portal-session/route.ts           # LIVE Stripe portal
│       ├── billing/webhook/route.ts                  # LIVE Stripe webhook (signature verified)
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
├── pipeline.py                # LIVE: single Claude call per job (parse + score + summary); auto-mocks if key absent
├── scraper.py                 # LIVE: Playwright career page scraper with JSON-LD + httpx location enrichment
├── ats_clients.py             # LIVE: Real Greenhouse / Lever / Ashby public API calls
├── email_client.py            # LIVE: Resend REST API; mock fallback when RESEND_API_KEY absent
├── scheduler.py               # MOCK: stub scheduler, no cron jobs
├── jobs_runner.py             # check_user_jobs() — master orchestrator
├── seed_demo.py               # Demo data seeder (user, companies, 20 postings)
├── seed_ats.py                # ATS companies seeder (105 companies)
├── ats_seed_data.py           # ATS company list data
├── requirements.txt           # Python dependencies (includes playwright==1.58.0, httpx==0.27.2)
├── railway.toml               # Railway deploy config — buildCommand installs Playwright Chromium
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
2. APScheduler (`backend/scheduler.py`) is still a stub — no cron jobs run. See "Switching Remaining Services to Live Mode" above.
3. The FastAPI backend's `seed_demo.py` auto-seed may fail if the DB schema hasn't been pushed yet (Prisma migration runs on Next.js service, not FastAPI)
4. Mobile responsive layout is basic — tablet (768px+) is functional, phone is stretch goal
5. No error boundary component yet (planned)
6. Playwright scraper location extraction falls back to `"See posting"` for Cloudflare-protected or bot-detection-heavy career pages that block plain httpx requests
7. Companies with only 1–2 job openings may return zero results — the clustering threshold requires 2+ identical URL shapes. JSON-LD (Layer 1) helps if the site implements schema.
8. No hard limit on DB rows per user — for very large watchlists tracking companies with thousands of jobs (e.g. HPE), the `job_postings` table will grow quickly. Monitor row counts and consider adding a per-user retention policy before production scale.
9. Prisma has no connection pooling configured — will hit PostgreSQL connection limits around 50–100 concurrent users. Fix: add Prisma Accelerate or PgBouncer before scaling.

---

## Changelog

### 2026-04-12
- **Scraper rewrite:** Completely rewrote `backend/scraper.py` with a 5-layer job detection approach (JSON-LD → URL clustering → DOM parent grouping → base-path child check → content sampling). Replaced keyword-based `_is_job_link()` — which had false positives (customer centres, recycling pages) — with a cluster-based approach that works across any career page structure.
- **Pagination support:** Added URL-pattern pagination detection (`?page=N`, `?start=N`, path-segment pagination) with parallel `httpx` fetches. Dynamic scroll and load-more clicking replace fixed-step scroll. No fixed job collection cap.
- **Title pre-filter:** Added `_title_matches_profile(title, profile)` to `backend/pipeline.py`. Called before the Claude API call in `ingest_posting()`. If the job title shares no keywords with the candidate's `target_roles` + `high_value_titles`, the posting is stored with a default score of 5 without an API call. This is the cost gate that replaces the removed 50-job collection cap.
- **Location pre-filter:** Added `_location_passes_filter(job_location, preferred_locations)` to `backend/pipeline.py`. Rejects postings with a clear non-US country in the last comma-segment (e.g. "Tokyo, Japan") when all candidate preferences are US-oriented. Strengthened the Claude prompt with a hard 35-score cap for confirmed location mismatches.
- **Company URL validation:** Added `POST /api/jobs/validate-url` endpoint to `backend/routers/jobs.py` (calls `preview_career_page()`). The Next.js `POST /api/companies` route now fires a non-blocking preview call after saving the company and returns `{ company, preview }` — gives the UI early feedback on job count without blocking the save.
- **`preview_career_page()`:** New lightweight function in `scraper.py` that runs a page-1-only scrape and returns `{ status, job_count, samples, message }` for company-add-time validation.

### 2026-04-10
- **Live:** Replaced mock Stripe billing routes in `src/app/api/billing/`. `create-checkout-session` creates a real Stripe Checkout session (looks up or creates a Stripe Customer, stores `stripe_customer_id` on the user). `portal-session` opens the Stripe Customer Portal for plan changes and cancellations. `webhook` verifies the Stripe signature and updates `subscription_tier` + `subscription_status` in the DB on `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, and `invoice.payment_failed`. Falls back to `FREE` / `CANCELED` on subscription deletion.
- **Live:** Replaced mock email client in `backend/email_client.py` with a real Resend REST API implementation using `httpx`. The `_send()` function now posts to `https://api.resend.com/emails` with `Authorization: Bearer {RESEND_API_KEY}`. HTML email templates ported from `src/lib/email.ts` preserving the Radar dark-theme design system (navy background, electric blue CTA, grade-based score badges). Auto-falls back to console logging when `RESEND_API_KEY` is not set. Both `send_instant_alert()` and `send_digest()` signatures are unchanged.
- **Live:** Replaced mock AI pipeline in `backend/pipeline.py` with a real Claude API implementation. A single combined `analyze_job_posting()` call now handles job description parsing, candidate match scoring, and summary generation together (vs three separate mock functions before). Auto-falls back to mock behaviour when `ANTHROPIC_API_KEY` is not set, so local dev without a key continues to work. The three legacy function signatures (`parse_job_description`, `score_match`, `generate_summary`) are preserved as thin wrappers for backwards compatibility but are no longer called by `ingest_posting` directly.

### 2026-04-09
- **Fixed:** `apply_url` in mock scraper (`backend/scraper.py`) and seed data (`backend/seed_demo.py`) was generating fake URL slugs (e.g. `https://careers.google.com/data-analyst-demo`) that 404'd and redirected to the general careers page. Fixed to use the company's real careers page root URL for seed/mock data.
- **Live:** Replaced mock `backend/scraper.py` with a real Playwright implementation. Scrapes career pages, extracts per-job URLs and titles, and enriches location via JSON-LD parsing, DOM heuristics, and concurrent async httpx fetches of individual job pages.
- **Live:** Replaced mock `backend/ats_clients.py` with real API calls to Greenhouse (REST), Lever (REST), and Ashby (GraphQL) public job board APIs. All return real per-job `apply_url` values.
- **Config:** Updated `backend/railway.toml` to install Playwright's Chromium browser binary during Railway build (`playwright install chromium --with-deps`).

---

## How to Give an LLM Context About This Project

Paste this entire document, then add your specific question. For code-level help, also share:
- The specific file(s) involved (copy from VS Code)
- Any error messages (full stack trace)
- Which service the error came from (Next.js build log vs FastAPI log vs browser console)
- Whether you're running locally or on Railway

The GitHub repo is public at: https://github.com/adamabrahamson99-star/Job-Radar
Any LLM with web access can read files directly from there.
