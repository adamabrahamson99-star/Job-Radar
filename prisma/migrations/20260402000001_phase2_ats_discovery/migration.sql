-- Phase 2: ATS companies + Discovery settings

CREATE TYPE "AtsSource" AS ENUM ('GREENHOUSE', 'LEVER', 'ASHBY');

CREATE TABLE "ats_companies" (
    "id"           TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "source"       "AtsSource" NOT NULL,
    "company_slug" TEXT NOT NULL,
    "company_name" TEXT NOT NULL,
    "is_active"    BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "ats_companies_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ats_companies_source_company_slug_key" UNIQUE ("source", "company_slug")
);

CREATE TABLE "discovery_settings" (
    "id"                 TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "user_id"            TEXT NOT NULL,
    "greenhouse_enabled" BOOLEAN NOT NULL DEFAULT false,
    "lever_enabled"      BOOLEAN NOT NULL DEFAULT false,
    "ashby_enabled"      BOOLEAN NOT NULL DEFAULT false,
    "location_keywords"  TEXT[] NOT NULL DEFAULT '{}',
    "role_keywords"      TEXT[] NOT NULL DEFAULT '{}',
    "updated_at"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "discovery_settings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "discovery_settings_user_id_key" UNIQUE ("user_id"),
    CONSTRAINT "discovery_settings_user_id_fkey"
        FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);
