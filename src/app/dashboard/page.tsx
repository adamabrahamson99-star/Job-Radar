"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import { JobCard } from "@/components/feed/JobCard";
import { FilterBar } from "@/components/feed/FilterBar";
import { cn } from "@/lib/utils";
import type { JobPosting, JobStats, JobFilters } from "@/types/jobs";
import { DEFAULT_FILTERS, isDefaultFilters } from "@/types/jobs";

const PAGE_SIZE = 20;

type DashboardView = "all" | "watchlist" | "discovery";

// ─── Stats bar ────────────────────────────────────────────────────────────────

function StatsBar({ stats }: { stats: JobStats | null }) {
  if (!stats) {
    return (
      <div className="h-7 flex items-center gap-2">
        {[80, 60, 60, 50, 70].map((w, i) => (
          <div key={i} className="h-3 rounded bg-radar-elevated animate-pulse" style={{ width: w }} />
        ))}
      </div>
    );
  }
  const items = [
    { label: "Active", value: stats.total_active.toString() },
    { label: "New Today", value: stats.new_today.toString() },
    { label: "Saved", value: stats.saved_count.toString() },
    { label: "Applied", value: stats.applied_count.toString() },
    { label: "Avg Match", value: `${stats.avg_match_score}%` },
  ];
  return (
    <div className="flex items-center gap-4 text-xs font-mono">
      {items.map((item, i) => (
        <span key={item.label} className="flex items-center gap-1.5">
          <span className="text-text-muted">{item.label}</span>
          <span className="text-text-primary font-medium">{item.value}</span>
          {i < items.length - 1 && <span className="text-text-muted ml-2">·</span>}
        </span>
      ))}
    </div>
  );
}

// ─── New-since-last-visit banner ──────────────────────────────────────────────

function NewPostingsBanner({
  count,
  onDismiss,
}: {
  count: number;
  onDismiss: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-blue-500/10 border border-blue-500/25 rounded-xl animate-fade-in">
      <div className="flex items-center gap-2">
        <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
        <span className="text-sm text-blue-300">
          <span className="font-semibold font-mono">{count}</span> new posting{count !== 1 ? "s" : ""} since your last visit
        </span>
      </div>
      <button
        onClick={onDismiss}
        className="text-xs text-blue-400/70 hover:text-blue-300 transition-colors flex items-center gap-1"
        data-testid="button-dismiss-banner"
      >
        Dismiss
        <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      </button>
    </div>
  );
}

// ─── Empty states ─────────────────────────────────────────────────────────────

function EmptyNoPostings() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="relative w-16 h-16 mx-auto mb-5">
        <div className="absolute inset-0 rounded-full border border-blue-500/20 animate-ping" style={{ animationDuration: "3s" }} />
        <div className="absolute inset-2 rounded-full border border-blue-500/30" />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-3 h-3 rounded-full bg-blue-500/50" />
        </div>
      </div>
      <h3 className="text-base font-semibold text-text-primary mb-2" style={{ fontFamily: "Syne, sans-serif" }}>
        Your radar is warming up
      </h3>
      <p className="text-sm text-text-secondary mb-5 max-w-xs">
        Add companies to your watchlist or enable ATS discovery in Sources to start finding jobs.
      </p>
      <a
        href="/dashboard/sources"
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 transition-colors"
      >
        Go to Sources
        <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      </a>
    </div>
  );
}

function EmptyNoResults({ onClearFilters }: { onClearFilters: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <svg className="w-10 h-10 text-text-muted mb-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M3 6h18M7 12h10M11 18h2" strokeLinecap="round" />
      </svg>
      <h3 className="text-sm font-semibold text-text-primary mb-1">No results match your filters</h3>
      <p className="text-xs text-text-secondary mb-4">Try adjusting your criteria or clearing all filters.</p>
      <button
        onClick={onClearFilters}
        className="text-xs text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1"
      >
        <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
        Clear all filters
      </button>
    </div>
  );
}

function EmptyFreeNeverChecked({ onCheck, loading }: { onCheck: () => void; loading: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-14 h-14 rounded-2xl bg-radar-elevated border border-radar-border flex items-center justify-center mb-4">
        <svg className="w-7 h-7 text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <h3 className="text-base font-semibold text-text-primary mb-2" style={{ fontFamily: "Syne, sans-serif" }}>
        Run your first check
      </h3>
      <p className="text-sm text-text-secondary mb-5 max-w-xs">
        Radar will scan your watchlist companies and surface matching job postings.
      </p>
      <button
        onClick={onCheck}
        disabled={loading}
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 transition-colors disabled:opacity-60"
      >
        {loading ? (
          <>
            <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Checking...
          </>
        ) : (
          <>
            <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
            </svg>
            Run Check
          </>
        )}
      </button>
    </div>
  );
}

// ─── FREE tier check button (top bar) ─────────────────────────────────────────

function FreeCheckButton({
  onCheck,
  loading,
  checksRemaining,
}: {
  onCheck: () => void;
  loading: boolean;
  checksRemaining: number;
}) {
  const atLimit = checksRemaining <= 0;
  return (
    <div className="flex items-center gap-2">
      {checksRemaining < 100 && (
        <span className="text-xs font-mono text-text-muted">
          {checksRemaining} check{checksRemaining !== 1 ? "s" : ""} left
        </span>
      )}
      <button
        onClick={onCheck}
        disabled={loading || atLimit}
        title={atLimit ? "Monthly limit reached — resets on the 1st" : "Run a manual job check"}
        className={cn(
          "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all",
          atLimit
            ? "bg-radar-elevated border-radar-border text-text-muted cursor-not-allowed opacity-50"
            : "bg-blue-500/10 border-blue-500/30 text-blue-400 hover:bg-blue-500/20 hover:border-blue-500/50"
        )}
        data-testid="button-free-check"
      >
        {loading ? (
          <>
            <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Checking...
          </>
        ) : (
          <>
            <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
            </svg>
            Run Check
          </>
        )}
      </button>
    </div>
  );
}

// ─── Pagination ───────────────────────────────────────────────────────────────

function Pagination({
  page,
  totalPages,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  onPageChange: (p: number) => void;
}) {
  if (totalPages <= 1) return null;
  const pages = Array.from({ length: Math.min(totalPages, 9) }, (_, i) => {
    if (totalPages <= 9) return i + 1;
    if (i < 4) return i + 1;
    if (i === 4) return null; // ellipsis
    return totalPages - (8 - i);
  });

  return (
    <div className="flex items-center justify-center gap-1 mt-8">
      <button
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        className="p-2 rounded-lg border border-radar-border text-text-muted hover:text-text-primary hover:border-blue-500/30 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
      >
        <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
        </svg>
      </button>
      {pages.map((p, i) =>
        p === null ? (
          <span key={`ellipsis-${i}`} className="px-2 text-text-muted text-sm">…</span>
        ) : (
          <button
            key={p}
            onClick={() => onPageChange(p)}
            className={cn(
              "w-8 h-8 rounded-lg border text-sm font-mono transition-all",
              p === page
                ? "bg-blue-500/20 border-blue-500/50 text-blue-400"
                : "border-radar-border text-text-muted hover:text-text-primary hover:border-blue-500/20"
            )}
          >
            {p}
          </button>
        )
      )}
      <button
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
        className="p-2 rounded-lg border border-radar-border text-text-muted hover:text-text-primary hover:border-blue-500/30 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
      >
        <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
        </svg>
      </button>
    </div>
  );
}

// ─── Main dashboard page ──────────────────────────────────────────────────────

export default function DashboardPage() {
  const { data: session } = useSession();
  const tier = (session?.user as any)?.subscriptionTier ?? "FREE";
  const isFree = tier === "FREE";

  const [postings, setPostings] = useState<JobPosting[]>([]);
  const [stats, setStats] = useState<JobStats | null>(null);
  const [filters, setFilters] = useState<JobFilters>(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const [newCount, setNewCount] = useState(0);
  const [showBanner, setShowBanner] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const bannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [roleCategories, setRoleCategories] = useState<string[]>([]);
  const [locations, setLocations] = useState<string[]>([]);

  const [checksRemaining, setChecksRemaining] = useState(3);
  const [checkRunning, setCheckRunning] = useState(false);

  const [highValueSkills, setHighValueSkills] = useState<string[]>([]);
  const [highValueTitles, setHighValueTitles] = useState<string[]>([]);

  const [dashView, setDashView] = useState<DashboardView>("all");

  // Build API query params from filters
  const buildParams = useCallback(
    (f: JobFilters, p: number, view: DashboardView) => {
      const params = new URLSearchParams({ page: String(p), limit: String(PAGE_SIZE) });
      if (f.search) params.set("search", f.search);
      if (f.role_categories.length) params.set("role_category", f.role_categories.join(","));
      if (f.experience_levels.length) params.set("experience_level", f.experience_levels.join(","));
      if (f.locations.length) params.set("location", f.locations[0]); // one at a time for now
      if (f.sources.length) params.set("source", f.sources.join(","));
      if (f.statuses.length) params.set("status", f.statuses.join(","));
      params.set("sort", f.sort);
      if (view !== "all") params.set("view", view);
      return params.toString();
    },
    []
  );

  // Fetch jobs
  const fetchJobs = useCallback(
    async (f: JobFilters, p: number, view: DashboardView = "all") => {
      setLoading(true);
      try {
        const qs = buildParams(f, p, view);
        const res = await fetch(`/api/jobs?${qs}`);
        const data = await res.json();
        if (res.ok) {
          setPostings(data.postings ?? []);
          setTotalPages(data.pagination?.pages ?? 1);
          setTotalCount(data.pagination?.total ?? 0);
          // Count new ones
          const newOnes = (data.postings ?? []).filter((j: JobPosting) => j.is_new_since_last_visit).length;
          if (newOnes > 0 && !bannerDismissed) {
            setNewCount(newOnes);
            setShowBanner(true);
          }
        }
      } finally {
        setLoading(false);
      }
    },
    [buildParams, bannerDismissed]
  );

  // Fetch stats
  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch("/api/jobs/stats");
      if (res.ok) setStats(await res.json());
    } catch {}
  }, []);

  // Fetch filter options
  const fetchFilterOptions = useCallback(async () => {
    try {
      const res = await fetch("/api/jobs/filter-options");
      if (res.ok) {
        const data = await res.json();
        setRoleCategories(data.role_categories ?? []);
        setLocations(data.locations ?? []);
      }
    } catch {}
  }, []);

  // Fetch profile for high-value terms
  const fetchProfile = useCallback(async () => {
    try {
      const res = await fetch("/api/profile/get");
      if (res.ok) {
        const data = await res.json();
        setHighValueSkills(data.profile?.high_value_skills ?? []);
        setHighValueTitles(data.profile?.high_value_titles ?? []);
      }
    } catch {}
  }, []);

  // Fetch current manual check remaining
  const fetchUser = useCallback(async () => {
    if (!isFree) return;
    try {
      const res = await fetch("/api/auth/session");
      // Use the user data from the session — we just need the count
      // The actual remaining count comes from the manual-check endpoint response
    } catch {}
  }, [isFree]);

  // Initial load
  useEffect(() => {
    fetchJobs(filters, 1);
    fetchStats();
    fetchFilterOptions();
    fetchProfile();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-fetch when filters/page/view change
  useEffect(() => {
    fetchJobs(filters, page, dashView);
  }, [filters, page, dashView]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-dismiss banner after 30 seconds
  useEffect(() => {
    if (showBanner && !bannerDismissed) {
      bannerTimerRef.current = setTimeout(() => {
        dismissBanner();
      }, 30000);
    }
    return () => {
      if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
    };
  }, [showBanner, bannerDismissed]); // eslint-disable-line react-hooks/exhaustive-deps

  const dismissBanner = useCallback(() => {
    setShowBanner(false);
    setBannerDismissed(true);
    // Fire mark-visited in background
    fetch("/api/jobs/mark-visited", { method: "POST" }).catch(() => {});
  }, []);

  const handleFilterChange = (f: JobFilters) => {
    setFilters(f);
    setPage(1);
  };

  const handleViewChange = (v: DashboardView) => {
    setDashView(v);
    setPage(1);
  };

  const handleStatusChange = (id: string, newStatus: string) => {
    setPostings((prev) =>
      prev.map((p) => (p.id === id ? { ...p, status: newStatus as any } : p))
    );
  };

  const handleManualCheck = async () => {
    setCheckRunning(true);
    try {
      const res = await fetch("/api/jobs/manual-check", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setChecksRemaining(data.checks_remaining ?? 0);
        // Refresh everything
        await Promise.all([fetchJobs(filters, 1), fetchStats()]);
        setPage(1);
      } else if (res.status === 429) {
        setChecksRemaining(0);
      }
    } finally {
      setCheckRunning(false);
    }
  };

  const hasAnyPostings = totalCount > 0 || !isDefaultFilters(filters);
  const hasFiltersActive = !isDefaultFilters(filters);

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* Top bar */}
      <header className="flex-shrink-0 h-14 border-b border-radar-border bg-radar-surface/80 backdrop-blur-sm px-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <h1 className="text-sm font-semibold text-text-primary" style={{ fontFamily: "Syne, sans-serif" }}>
            Job Feed
          </h1>

          {/* Watchlist / Discovery view toggle */}
          <div className="flex gap-0.5 bg-radar-elevated border border-radar-border rounded-lg p-0.5">
            {(["all", "watchlist", "discovery"] as DashboardView[]).map((v) => (
              <button
                key={v}
                onClick={() => handleViewChange(v)}
                className={cn(
                  "px-3 py-1 rounded-md text-xs font-medium transition-all duration-150 capitalize",
                  dashView === v
                    ? "bg-radar-surface text-text-primary shadow-sm"
                    : "text-text-muted hover:text-text-secondary"
                )}
                data-testid={`view-toggle-${v}`}
              >
                {v === "all" ? "All" : v === "watchlist" ? "Watchlist" : "Discovery"}
              </button>
            ))}
          </div>

          {checkRunning && (
            <div className="flex items-center gap-1.5 text-xs text-blue-400">
              <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
              Checking...
            </div>
          )}
        </div>

        {/* MOCK MODE: Run Check available to all tiers */}
        <FreeCheckButton
          onCheck={handleManualCheck}
          loading={checkRunning}
          checksRemaining={isFree ? checksRemaining : 999}
        />
      </header>

      {/* Stats bar */}
      <div className="flex-shrink-0 px-6 py-2.5 border-b border-radar-border bg-radar-base/40">
        <StatsBar stats={stats} />
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-4xl mx-auto px-6 py-5">
          {/* Filter bar */}
          <div className="mb-5 bg-radar-surface/60 backdrop-blur-sm border border-radar-border rounded-xl p-3">
            <FilterBar
              filters={filters}
              onChange={handleFilterChange}
              roleCategories={roleCategories}
              locations={locations}
            />
          </div>

          {/* New since last visit banner */}
          {showBanner && newCount > 0 && (
            <div className="mb-4">
              <NewPostingsBanner count={newCount} onDismiss={dismissBanner} />
            </div>
          )}

          {/* Feed */}
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="bg-radar-surface border border-radar-border rounded-2xl p-5 animate-pulse"
                >
                  <div className="flex justify-between mb-3">
                    <div className="space-y-2 flex-1">
                      <div className="h-3 bg-radar-elevated rounded w-24" />
                      <div className="h-5 bg-radar-elevated rounded w-64" />
                    </div>
                    <div className="w-16 h-8 bg-radar-elevated rounded-lg" />
                  </div>
                  <div className="flex gap-2 mb-3">
                    {[60, 50, 70, 55].map((w) => (
                      <div key={w} className="h-5 bg-radar-elevated rounded-md" style={{ width: w }} />
                    ))}
                  </div>
                  <div className="space-y-1.5">
                    <div className="h-3 bg-radar-elevated rounded w-full" />
                    <div className="h-3 bg-radar-elevated rounded w-5/6" />
                    <div className="h-3 bg-radar-elevated rounded w-4/6" />
                  </div>
                </div>
              ))}
            </div>
          ) : postings.length === 0 ? (
            hasFiltersActive ? (
              <EmptyNoResults onClearFilters={() => handleFilterChange(DEFAULT_FILTERS)} />
            ) : isFree && checksRemaining === 3 ? (
              <EmptyFreeNeverChecked onCheck={handleManualCheck} loading={checkRunning} />
            ) : (
              <EmptyNoPostings />
            )
          ) : (
            <>
              {/* Result count */}
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs text-text-muted font-mono">
                  {totalCount} posting{totalCount !== 1 ? "s" : ""}
                  {hasFiltersActive && " matching filters"}
                </p>
              </div>

              {/* Cards */}
              <div className="space-y-3">
                {postings
                  .filter((p) => p.status !== "NOT_INTERESTED" || filters.statuses.includes("NOT_INTERESTED"))
                  .map((posting) => (
                    <JobCard
                      key={posting.id}
                      posting={posting}
                      highValueSkills={highValueSkills}
                      highValueTitles={highValueTitles}
                      onStatusChange={handleStatusChange}
                    />
                  ))}
              </div>

              <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
