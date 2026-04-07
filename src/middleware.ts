import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const pathname = req.nextUrl.pathname;

    // If authenticated user hits auth pages, redirect to dashboard
    if (pathname.startsWith("/auth/") && token) {
      return NextResponse.redirect(new URL("/dashboard/profile", req.url));
    }

    // If authenticated but onboarding not complete, redirect to onboarding
    // (except if they're already on onboarding)
    if (
      token &&
      !token.onboardingCompleted &&
      !pathname.startsWith("/onboarding") &&
      pathname.startsWith("/dashboard")
    ) {
      return NextResponse.redirect(new URL("/onboarding", req.url));
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        const pathname = req.nextUrl.pathname;
        // Allow auth pages and onboarding without token
        if (pathname.startsWith("/auth/")) return true;
        // Protect dashboard and onboarding
        if (pathname.startsWith("/dashboard") || pathname.startsWith("/onboarding")) {
          return !!token;
        }
        return true;
      },
    },
  }
);

export const config = {
  matcher: ["/dashboard/:path*", "/onboarding/:path*", "/auth/:path*"],
};
