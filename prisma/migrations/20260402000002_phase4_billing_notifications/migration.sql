-- Phase 4: Notification preferences

CREATE TABLE "notification_preferences" (
    "id"                      TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "user_id"                 TEXT NOT NULL,
    "email_enabled"           BOOLEAN NOT NULL DEFAULT true,
    "instant_alert_threshold" INTEGER NOT NULL DEFAULT 75,
    "updated_at"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "notification_preferences_user_id_key" UNIQUE ("user_id"),
    CONSTRAINT "notification_preferences_user_id_fkey"
        FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);

-- Phase 4: Grant 14-day Pro trial to all existing users who are still FREE (backfill)
-- Note: new user registration sets trial_ends_at automatically via application code
-- This migration is intentionally a no-op for trial_ends_at (already nullable from Phase 1)
