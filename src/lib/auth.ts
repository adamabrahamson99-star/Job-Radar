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
        };
      },
    }),
  ],
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days default
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
      }
      // Refresh onboarding status on every token refresh
      if (trigger === "update" || !token.onboardingCompleted) {
        const dbUser = await prisma.user.findUnique({
          where: { id: token.id as string },
          select: { onboarding_completed: true, subscription_tier: true },
        });
        if (dbUser) {
          token.onboardingCompleted = dbUser.onboarding_completed;
          token.subscriptionTier = dbUser.subscription_tier;
        }
      }
      return token;
    },
    async session({ session, token }) {
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
