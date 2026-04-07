import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

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
