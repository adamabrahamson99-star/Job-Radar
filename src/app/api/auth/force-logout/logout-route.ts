import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

/**
 * POST /api/auth/force-logout
 *
 * Clears all NextAuth session cookies, forcing the user back to the login page.
 * Useful during development when wiping the Railway DB — stale JWTs will
 * keep redirecting to the dashboard even though the user no longer exists.
 *
 * Also accessible via GET so you can just paste the URL in your browser:
 *   https://your-app.up.railway.app/api/auth/force-logout
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
  return NextResponse.json({ ok: true, message: "All sessions cleared. Redirecting to login." });
}

export async function GET(req: NextRequest) {
  clearSessionCookies();
  // Redirect to login page after clearing
  return NextResponse.redirect(new URL("/auth/login", req.url));
}
