import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import crypto from "crypto";

/**
 * GET /api/seed — Check if demo data exists
 * POST /api/seed — Seed demo data (only if DB is empty)
 */

const SUMMARY =
  "This role focuses on building and maintaining data pipelines and dashboards for internal business teams. The team operates in an agile environment with modern tooling. Strong SQL and Python skills are required with exposure to cloud platforms preferred.";
const EXPLANATION =
  "Strong alignment on Python and SQL skills which are central to this role. Your target roles closely match this position. Junior-level experience aligns with the posted requirements.";

function fingerprint(company: string, title: string, url: string) {
  return crypto
    .createHash("sha256")
    .update(`${company.toLowerCase()}|${title.toLowerCase()}|${url.toLowerCase()}`)
    .digest("hex");
}

export async function GET() {
  try {
    const count = await prisma.user.count();
    return NextResponse.json({ seeded: count > 0, user_count: count });
  } catch (e: any) {
    return NextResponse.json({ seeded: false, error: e.message }, { status: 500 });
  }
}

export async function POST() {
  try {
    const count = await prisma.user.count();
    if (count > 0) {
      return NextResponse.json({ ok: false, message: "Already seeded" });
    }

    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + 10);
    const passwordHash = await bcrypt.hash("Demo1234!", 12);

    const user = await prisma.user.create({
      data: {
        email: "demo@radar.app",
        password_hash: passwordHash,
        full_name: "Alex Chen",
        subscription_tier: "PRO",
        subscription_status: "TRIALING",
        trial_ends_at: trialEndsAt,
        onboarding_completed: true,
        manual_checks_reset_at: new Date(),
      },
    });

    await prisma.candidateProfile.create({
      data: {
        user_id: user.id,
        experience_level: "ENTRY",
        years_of_experience: 1,
        skills: ["Python", "SQL", "React", "TypeScript", "Data Analysis", "Git"],
        target_roles: ["Data Analyst", "Junior Software Engineer", "Business Analyst"],
        education: [{ degree: "B.S.", field: "Computer Science", institution: "State University", year: 2024 }],
        high_value_skills: ["Python", "SQL"],
        high_value_titles: ["Data Analyst", "Junior Software Engineer"],
        preferred_locations: ["Denver, CO", "Remote"],
        parsed_at: new Date(),
      },
    });

    const companiesList = [
      { company_name: "Google", career_page_url: "https://careers.google.com" },
      { company_name: "Stripe", career_page_url: "https://stripe.com/jobs" },
      { company_name: "Notion", career_page_url: "https://notion.so/careers" },
      { company_name: "Airbnb", career_page_url: "https://careers.airbnb.com" },
      { company_name: "Linear", career_page_url: "https://linear.app/careers" },
    ];
    const companyMap: Record<string, string> = {};
    for (const c of companiesList) {
      const created = await prisma.company.create({
        data: { user_id: user.id, ...c, is_active: true, posting_count: 4 },
      });
      companyMap[c.company_name] = created.id;
    }

    type ExpLevel = "ENTRY" | "MID" | "SENIOR" | "STAFF";
    type JobStatus = "NEW" | "SAVED" | "APPLIED" | "NOT_INTERESTED";

    const postings: Array<{
      company: string; title: string; location: string; exp: ExpLevel; cat: string;
      match: number; status: JobStatus; isNew: boolean; days: number;
      salRaw: string | null; salMin: number | null; salMax: number | null;
    }> = [
      { company: "Google", title: "Data Analyst, Trust & Safety", location: "Remote (US)", exp: "ENTRY", cat: "Data Engineering", match: 96, status: "SAVED", isNew: true, days: 1, salRaw: "$95,000 – $120,000", salMin: 95000, salMax: 120000 },
      { company: "Google", title: "Junior Software Engineer, Platforms", location: "San Francisco, CA", exp: "ENTRY", cat: "Backend", match: 88, status: "NEW", isNew: true, days: 2, salRaw: "$115,000 – $140,000", salMin: 115000, salMax: 140000 },
      { company: "Google", title: "Business Intelligence Analyst", location: "New York, NY", exp: "MID", cat: "Data Engineering", match: 82, status: "NEW", isNew: true, days: 3, salRaw: null, salMin: null, salMax: null },
      { company: "Google", title: "DevOps Engineer, Cloud Infrastructure", location: "Austin, TX", exp: "MID", cat: "DevOps", match: 61, status: "NOT_INTERESTED", isNew: false, days: 7, salRaw: "$125,000 – $155,000", salMin: 125000, salMax: 155000 },
      { company: "Stripe", title: "Data Engineer, Payments Intelligence", location: "Remote", exp: "ENTRY", cat: "Data Engineering", match: 91, status: "APPLIED", isNew: false, days: 5, salRaw: "$105,000 – $130,000", salMin: 105000, salMax: 130000 },
      { company: "Stripe", title: "Frontend Engineer, Dashboard", location: "Remote (US)", exp: "MID", cat: "Frontend", match: 74, status: "SAVED", isNew: true, days: 2, salRaw: null, salMin: null, salMax: null },
      { company: "Stripe", title: "Business Analyst, Revenue Operations", location: "Denver, CO", exp: "ENTRY", cat: "Data Engineering", match: 85, status: "NEW", isNew: true, days: 1, salRaw: "$80,000 – $100,000", salMin: 80000, salMax: 100000 },
      { company: "Stripe", title: "ML Engineer, Fraud Detection", location: "San Francisco, CA", exp: "MID", cat: "ML/AI", match: 58, status: "NOT_INTERESTED", isNew: false, days: 10, salRaw: "$140,000 – $170,000", salMin: 140000, salMax: 170000 },
      { company: "Notion", title: "Data Analyst, Product Growth", location: "Remote", exp: "ENTRY", cat: "Data Engineering", match: 93, status: "APPLIED", isNew: false, days: 8, salRaw: "$90,000 – $110,000", salMin: 90000, salMax: 110000 },
      { company: "Notion", title: "Full Stack Engineer", location: "New York, NY", exp: "MID", cat: "Full Stack", match: 69, status: "NEW", isNew: false, days: 6, salRaw: null, salMin: null, salMax: null },
      { company: "Notion", title: "Junior Product Analyst", location: "Remote (US)", exp: "ENTRY", cat: "Data Engineering", match: 87, status: "NEW", isNew: true, days: 3, salRaw: "$75,000 – $95,000", salMin: 75000, salMax: 95000 },
      { company: "Notion", title: "Backend Engineer, Infrastructure", location: "San Francisco, CA", exp: "MID", cat: "Backend", match: 55, status: "NOT_INTERESTED", isNew: false, days: 12, salRaw: null, salMin: null, salMax: null },
      { company: "Airbnb", title: "Data Analyst, Trust & Community", location: "Remote (US)", exp: "ENTRY", cat: "Data Engineering", match: 79, status: "NEW", isNew: true, days: 4, salRaw: "$92,000 – $115,000", salMin: 92000, salMax: 115000 },
      { company: "Airbnb", title: "Software Engineer II, Payments", location: "San Francisco, CA", exp: "MID", cat: "Backend", match: 63, status: "NEW", isNew: false, days: 9, salRaw: null, salMin: null, salMax: null },
      { company: "Airbnb", title: "Frontend Engineer, Listings", location: "Denver, CO", exp: "ENTRY", cat: "Frontend", match: 71, status: "SAVED", isNew: false, days: 11, salRaw: "$100,000 – $125,000", salMin: 100000, salMax: 125000 },
      { company: "Airbnb", title: "Business Intelligence Developer", location: "Remote", exp: "MID", cat: "Data Engineering", match: 45, status: "NOT_INTERESTED", isNew: false, days: 14, salRaw: null, salMin: null, salMax: null },
      { company: "Linear", title: "Junior Data Engineer", location: "Remote", exp: "ENTRY", cat: "Data Engineering", match: 94, status: "SAVED", isNew: true, days: 1, salRaw: "$85,000 – $105,000", salMin: 85000, salMax: 105000 },
      { company: "Linear", title: "Full Stack Engineer", location: "Remote (US)", exp: "MID", cat: "Full Stack", match: 76, status: "NEW", isNew: false, days: 5, salRaw: null, salMin: null, salMax: null },
      { company: "Linear", title: "Product Analyst", location: "Remote", exp: "ENTRY", cat: "Data Engineering", match: 89, status: "NEW", isNew: true, days: 2, salRaw: "$80,000 – $98,000", salMin: 80000, salMax: 98000 },
      { company: "Linear", title: "DevOps Engineer", location: "Remote", exp: "MID", cat: "DevOps", match: 48, status: "NOT_INTERESTED", isNew: false, days: 13, salRaw: null, salMin: null, salMax: null },
    ];

    for (const p of postings) {
      const applyUrl = `https://${p.company.toLowerCase()}.com/jobs/${p.title.toLowerCase().replace(/[\s,]+/g, "-")}-demo`;
      const fp = fingerprint(p.company, p.title, applyUrl);
      const postedAt = new Date();
      postedAt.setDate(postedAt.getDate() - p.days);

      await prisma.jobPosting.create({
        data: {
          user_id: user.id,
          company_id: companyMap[p.company],
          external_id: fp,
          title: p.title,
          company_name: p.company,
          location: p.location,
          salary_min: p.salMin,
          salary_max: p.salMax,
          salary_currency: p.salMin ? "USD" : null,
          salary_raw: p.salRaw,
          description_raw: `We are looking for a ${p.title} at ${p.company}. Python and SQL experience required.`,
          description_summary: SUMMARY,
          match_score: p.match,
          match_explanation: EXPLANATION,
          experience_level: p.exp,
          role_category: p.cat,
          apply_url: applyUrl,
          source: "WATCHLIST",
          status: p.status,
          is_new_since_last_visit: p.isNew,
          posted_at: postedAt,
          first_seen_at: postedAt,
        },
      });
    }

    await prisma.discoverySettings.create({
      data: {
        user_id: user.id,
        location_keywords: ["Remote", "Denver, CO"],
        role_keywords: ["Data Analyst", "Engineer"],
      },
    });

    return NextResponse.json({
      ok: true,
      credentials: { email: "demo@radar.app", password: "Demo1234!" },
    });
  } catch (e: any) {
    console.error("Seed error:", e);
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
