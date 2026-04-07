"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { RadarLogo } from "./RadarLogo";
import { TrialBanner } from "./TrialBanner";
import { cn } from "@/lib/utils";

const navItems = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
      </svg>
    ),
  },
  {
    href: "/dashboard/sources",
    label: "Sources",
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        <path d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
      </svg>
    ),
  },
  {
    href: "/dashboard/profile",
    label: "Profile",
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z" />
      </svg>
    ),
  },
];

// Billing: Phase 4 placeholder
const billingItem = {
  href: "/dashboard/billing",
  label: "Billing",
  icon: (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
      <path d="M1 10h22" />
    </svg>
  ),
};

interface DashboardShellProps {
  children: React.ReactNode;
}

export function DashboardShell({ children }: DashboardShellProps) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const tier = (session?.user as any)?.subscriptionTier ?? "FREE";

  const tierColor =
    tier === "UNLIMITED" ? "text-purple-400" :
    tier === "PRO" ? "text-green-400" :
    tier === "STARTER" ? "text-blue-400" :
    "text-text-muted";

  return (
    <div className="min-h-screen bg-radar-base flex">
      {/* Sidebar */}
      <aside className="w-[220px] flex-shrink-0 border-r border-radar-border bg-radar-surface flex flex-col">
        {/* Logo */}
        <div className="h-14 px-5 flex items-center border-b border-radar-border">
          <RadarLogo size="sm" />
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-0.5">
          {navItems.map((item) => {
            const isActive =
              item.href === "/dashboard"
                ? pathname === "/dashboard"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all duration-150",
                  isActive
                    ? "bg-blue-500/15 text-blue-400 border border-blue-500/20"
                    : "text-text-secondary hover:text-text-primary hover:bg-radar-elevated"
                )}
              >
                {item.icon}
                {item.label}
              </Link>
            );
          })}

          {/* Billing — Phase 4 placeholder */}
          <div className="pt-3">
            <div
              className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-text-muted opacity-40 cursor-not-allowed"
              title="Available in Phase 4"
            >
              {billingItem.icon}
              {billingItem.label}
              <span className="ml-auto text-[9px] font-mono bg-radar-elevated border border-radar-border rounded px-1 py-0.5">
                SOON
              </span>
            </div>
          </div>
        </nav>

        {/* User section */}
        <div className="border-t border-radar-border p-3">
          <div className="flex items-center gap-2.5 px-3 py-2">
            <div className="w-7 h-7 rounded-full bg-blue-500/20 border border-blue-500/30 flex items-center justify-center text-xs font-mono font-medium text-blue-400 flex-shrink-0">
              {session?.user?.name?.[0]?.toUpperCase() || "?"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-text-primary truncate">
                {session?.user?.name || "User"}
              </p>
              <p className={cn("text-[10px] font-mono", tierColor)}>
                {tier}
              </p>
            </div>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: "/auth/login" })}
            className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs text-text-muted hover:text-text-secondary hover:bg-radar-elevated transition-all mt-1"
            data-testid="button-sign-out"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        <TrialBanner />
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
