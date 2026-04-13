import { NextResponse } from "next/server";

/**
 * Demo seeding has been removed. This endpoint is intentionally disabled.
 * The original seed logic is preserved in git history if needed for reference.
 */

export async function GET() {
  return NextResponse.json({ seeded: true, disabled: true }, { status: 200 });
}

export async function POST() {
  return NextResponse.json({ ok: false, message: "Seeding is disabled." }, { status: 410 });
}
