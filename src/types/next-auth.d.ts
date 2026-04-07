import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface User {
    id: string;
    subscriptionTier: string;
    onboardingCompleted: boolean;
  }
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      subscriptionTier: string;
      onboardingCompleted: boolean;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    subscriptionTier: string;
    onboardingCompleted: boolean;
  }
}
