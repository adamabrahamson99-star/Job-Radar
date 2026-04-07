# Radar — AI-Powered Job Intelligence Platform

> Full-stack job tracking application. 4 phases complete.

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 (App Router) + TypeScript |
| Styling | Tailwind CSS + custom design tokens |
| Auth | NextAuth.js v4 (JWT strategy, bcrypt) |
| Database | PostgreSQL + Prisma ORM v5 |
| AI | Anthropic Claude (claude-sonnet-4-20250514) |
| Backend | FastAPI (Python 3.11+) + APScheduler |
| Web scraping | Playwright (Python) |
| Payments | Stripe Checkout + Customer Portal |
| Email | Resend |
| File storage | Local filesystem (S3-ready path structure) |

---

## Prerequisites

- Node.js 18+
- Python 3.11+
- PostgreSQL 14+
- Anthropic API key
- Stripe account (test mode for development)
- Resend account (optional — emails gracefully skipped if not configured)

---

## Environment Variables

Copy `.env.example` to `.env` and fill in all values:

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string, e.g. `postgresql://user:pass@localhost:5432/radar_db` |
| `NEXTAUTH_SECRET` | Random 32-byte secret. Generate: `openssl rand -base64 32` |
| `NEXTAUTH_URL` | Full URL of the Next.js app, e.g. `http://localhost:3000` |
| `NEXT_PUBLIC_APP_URL` | Same as `NEXTAUTH_URL` |
| `ANTHROPIC_API_KEY` | Anthropic API key from console.anthropic.com |
| `NEXT_PUBLIC_API_URL` | FastAPI backend URL, e.g. `http://localhost:8000` |
| `PLAYWRIGHT_HEADLESS` | `true` (set to `false` to see browser during scraping) |
| `SCHEDULER_TIMEZONE` | `UTC` (recommended) |
| `STRIPE_SECRET_KEY` | Stripe secret key (`sk_test_...` for dev) |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret (`whsec_...`) |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe publishable key (`pk_test_...`) |
| `STRIPE_STARTER_MONTHLY_PRICE_ID` | Stripe Price ID for Starter monthly ($9/mo) |
| `STRIPE_STARTER_ANNUAL_PRICE_ID` | Stripe Price ID for Starter annual ($90/yr) |
| `STRIPE_PRO_MONTHLY_PRICE_ID` | Stripe Price ID for Pro monthly ($19/mo) |
| `STRIPE_PRO_ANNUAL_PRICE_ID` | Stripe Price ID for Pro annual ($190/yr) |
| `STRIPE_UNLIMITED_MONTHLY_PRICE_ID` | Stripe Price ID for Unlimited monthly ($34/mo) |
| `STRIPE_UNLIMITED_ANNUAL_PRICE_ID` | Stripe Price ID for Unlimited annual ($340/yr) |
| `RESEND_API_KEY` | Resend API key from resend.com |
| `EMAIL_FROM` | Sender address, e.g. `Radar <notifications@yourdomain.com>` |

---

## Stripe Setup

1. Create an account at [stripe.com](https://stripe.com) and enable test mode.
2. Create three Products in the Stripe Dashboard:
   - **Starter** → add Monthly ($9) and Annual ($90) prices
   - **Pro** → add Monthly ($19) and Annual ($190) prices
   - **Unlimited** → add Monthly ($34) and Annual ($340) prices
3. Copy each Price ID (starts with `price_`) into your `.env`.
4. Set up a webhook endpoint:
   - URL: `https://your-domain.com/api/billing/webhook`
   - Events to listen for:
     - `checkout.session.completed`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
     - `invoice.payment_failed`
5. Copy the webhook signing secret (`whsec_...`) into `STRIPE_WEBHOOK_SECRET`.

For local development, use the [Stripe CLI](https://stripe.com/docs/stripe-cli) to forward webhooks:
```bash
stripe listen --forward-to localhost:3000/api/billing/webhook
```

---

## Resend Setup

1. Create an account at [resend.com](https://resend.com).
2. Add and verify your sending domain (e.g. `yourdomain.com`).
3. Create an API key and add it to `RESEND_API_KEY`.
4. Set `EMAIL_FROM` to a verified sender address.

If `RESEND_API_KEY` is not set, email sends are silently skipped — the app works fully without it.

---

## Local Setup

### 1. Install frontend dependencies
```bash
cd radar
npm install
```

### 2. Configure environment
```bash
cp .env.example .env
# Edit .env with your values
```

### 3. Run database migrations
```bash
# Generate Prisma client
npx prisma generate

# Apply all migrations
npx prisma migrate dev

# Or push schema directly (faster for dev)
npx prisma db push

# Seed ATS companies (one-time)
cd backend && python seed_ats.py
```

### 4. Install Python backend dependencies
```bash
cd backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
python -m playwright install chromium
```

### 5. Start both servers

**Terminal 1 — Next.js frontend (port 3000):**
```bash
npm run dev
```

**Terminal 2 — FastAPI backend (port 8000):**
```bash
cd backend
source venv/bin/activate
uvicorn main:app --reload --port 8000
```

**Terminal 3 — Stripe webhooks (local dev only):**
```bash
stripe listen --forward-to localhost:3000/api/billing/webhook
```

---

## Pages

| Route | Description |
|---|---|
| `/auth/login` | Email/password login |
| `/auth/register` | Registration with 14-day Pro trial |
| `/onboarding` | 4-step onboarding wizard |
| `/dashboard` | Main job feed with filters and cards |
| `/dashboard/sources` | Watchlist + ATS discovery settings |
| `/dashboard/profile` | Profile editor + notification preferences |
| `/dashboard/billing` | Billing management + plan upgrades |

---

## Tier Features

| Feature | FREE | STARTER | PRO | UNLIMITED |
|---|---|---|---|---|
| Companies | 3 | 15 | 50 | ∞ |
| Check cadence | Manual | Mon+Thu 7am UTC | Daily 7am UTC | Every 6h |
| Manual checks | 3/month | — | — | — |
| ATS discovery | ✗ | 1 location | 3 locations | ∞ |
| Email digest | ✗ | Weekly | Daily | Daily |
| Instant alerts | ✗ | ✗ | ✓ | ✓ |
| Price | Free | $9/mo | $19/mo | $34/mo |

---

## Deployment

### Railway (recommended)
Railway supports Next.js, Python (FastAPI), and PostgreSQL as separate services.

1. Push repo to GitHub
2. Create new Railway project → Deploy from GitHub
3. Add services: **PostgreSQL** (managed) + **Next.js** + **FastAPI**
4. Set all environment variables in Railway dashboard
5. For FastAPI: set start command to `uvicorn main:app --host 0.0.0.0 --port $PORT`
6. Run database migration as a one-time job after first deploy

### Render
Render supports similar multi-service deployments. Use:
- **Web Service** (Node.js) for Next.js
- **Web Service** (Python) for FastAPI
- **PostgreSQL** (managed database)

### Webhooks
After deploying, update your Stripe webhook endpoint to the production URL and re-copy the signing secret.

---

## Architecture Notes

- The FastAPI backend handles CPU-intensive tasks: Playwright scraping, Claude API calls, APScheduler
- Next.js API routes handle auth, CRUD, and Stripe — keeping the frontend self-contained
- The scheduler bootstraps on FastAPI startup — it loads all active users and schedules their jobs
- Resume files are stored at `/storage/resumes/{user_id}/resume.pdf` — replace the write call with an S3 upload to go cloud-native
- All AI calls use `claude-sonnet-4-20250514` — swap the model string in `pipeline.py` to switch models

---

## Phase Summary

| Phase | Features |
|---|---|
| Phase 1 | Auth (register/login/JWT), resume parsing, candidate profile editor, 4-step onboarding |
| Phase 2 | Watchlist, ATS integrations (Greenhouse/Lever/Ashby), Playwright scraper, APScheduler, AI match scoring |
| Phase 3 | Job feed dashboard, filter bar, job cards, match scoring display, high-value highlighting, pagination |
| Phase 4 | Stripe subscriptions, 14-day Pro trial, billing page, Resend email notifications, toast system, upgrade prompts |
