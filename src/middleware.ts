import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const pathname = req.nextUrl.pathname;

    // If token exists but has no id, it was invalidated (user deleted from DB).
    // Clear it and redirect to login.
    if (token && !token.id) {
      const response = NextResponse.redirect(new URL("/auth/login", req.url));
      response.cookies.delete("next-auth.session-token");
      response.cookies.delete("__Secure-next-auth.session-token");
      return response;
    }

    // If authenticated user hits auth pages, redirect to dashboard
    if (pathname.startsWith("/auth/") && token) {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }

    // If authenticated but onboarding not complete, redirect to onboarding
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
        // Allow auth pages without token
        if (pathname.startsWith("/auth/")) return true;
        // Allow API routes (they handle their own auth)
        if (pathname.startsWith("/api/")) return true;
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
