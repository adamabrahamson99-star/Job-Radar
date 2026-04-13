import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        rememberMe: { label: "Remember Me", type: "text" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error("Email and password are required");
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email.toLowerCase() },
        });

        if (!user) {
          throw new Error("Invalid email or password");
        }

        const isValidPassword = await bcrypt.compare(
          credentials.password,
          user.password_hash
        );

        if (!isValidPassword) {
          throw new Error("Invalid email or password");
        }

        return {
          id: user.id,
          email: user.email,
          name: user.full_name,
          subscriptionTier: user.subscription_tier,
          onboardingCompleted: user.onboarding_completed,
          // Pass rememberMe through so the jwt callback can read it
          rememberMe: credentials.rememberMe === "true",
        };
      },
    }),
  ],
  session: {
    strategy: "jwt",
    // Default: short session (browser session — expires when browser closes)
    // Remember Me extends this to 30 days via the jwt callback below
    maxAge: 24 * 60 * 60, // 1 day default (fallback if rememberMe is not set)
  },
  pages: {
    signIn: "/auth/login",
    error: "/auth/login",
  },
  callbacks: {
    async jwt({ token, user, trigger }) {
      if (user) {
        token.id = user.id;
        token.subscriptionTier = (user as { subscriptionTier: string }).subscriptionTier;
        token.onboardingCompleted = (user as { onboardingCompleted: boolean }).onboardingCompleted;

        // Set token expiry based on Remember Me
        const rememberMe = (user as any).rememberMe;
        if (rememberMe) {
          // 30 days from now
          token.exp = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;
        } else {
          // 1 day from now — user must log in again tomorrow
          token.exp = Math.floor(Date.now() / 1000) + 24 * 60 * 60;
        }
      }

      // On every token refresh, verify the user still exists in the database
      if (token.id) {
        const dbUser = await prisma.user.findUnique({
          where: { id: token.id as string },
          select: { onboarding_completed: true, subscription_tier: true },
        });

        if (!dbUser) {
          // User was deleted from the database — invalidate this token
          // Returning an empty object forces NextAuth to treat the session as expired
          return {} as any;
        }

        // Sync latest values from DB
        token.onboardingCompleted = dbUser.onboarding_completed;
        token.subscriptionTier = dbUser.subscription_tier;

        // Dev account override — emails listed in DEV_ACCOUNT_EMAILS are always
        // treated as PRO/ACTIVE regardless of what's in the DB. This lets dev
        // accounts test all Pro features without being billed or auto-scheduled.
        const devEmails = (process.env.DEV_ACCOUNT_EMAILS ?? "")
          .split(",")
          .map((e) => e.trim().toLowerCase())
          .filter(Boolean);
        if (devEmails.includes((token.email as string ?? "").toLowerCase())) {
          token.subscriptionTier = "PRO";
        }
      }

      return token;
    },
    async session({ session, token }) {
      // If token was invalidated (user deleted), return empty session
      if (!token.id) {
        return {} as any;
      }

      if (session.user) {
        (session.user as { id: string; subscriptionTier: string; onboardingCompleted: boolean }).id = token.id;
        (session.user as { id: string; subscriptionTier: string; onboardingCompleted: boolean }).subscriptionTier = token.subscriptionTier as string;
        (session.user as { id: string; subscriptionTier: string; onboardingCompleted: boolean }).onboardingCompleted = token.onboardingCompleted as boolean;
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};
