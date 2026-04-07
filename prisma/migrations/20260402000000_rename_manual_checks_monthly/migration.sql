-- Migration: rename manual_checks_today -> manual_checks_this_month
-- Rate limit: 3 per month (was 3 per day) — reset cron: 1st of each month at 00:00 UTC

ALTER TABLE "users"
  RENAME COLUMN "manual_checks_today" TO "manual_checks_this_month";
