import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

/**
 * GET/POST /api/force-logout
 *
 * Clears all NextAuth session cookies, forcing the user back to the login page.
 * Useful during development when wiping the Railway DB.
 *
 * Usage: paste this in your browser:
 *   https://job-radar-production-9386.up.railway.app/api/force-logout
 */

function clearSessionCookies() {
  const cookieStore = cookies();
  const sessionCookieNames = [
    "next-auth.session-token",
    "__Secure-next-auth.session-token",
    "next-auth.csrf-token",
    "__Secure-next-auth.csrf-token",
    "next-auth.callback-url",
    "__Secure-next-auth.callback-url",
  ];

  for (const name of sessionCookieNames) {
    cookieStore.delete(name);
  }
}

export async function POST(req: NextRequest) {
  clearSessionCookies();
  return NextResponse.json({ ok: true, message: "All sessions cleared." });
}

export async function GET(req: NextRequest) {
  clearSessionCookies();
  return NextResponse.redirect(new URL("/auth/login", req.url));
}
