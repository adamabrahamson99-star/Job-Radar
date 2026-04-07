"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { highlightTerms } from "@/lib/highlight";
import type { JobPosting } from "@/types/jobs";

// ─── Match score grade ────────────────────────────────────────────────────────

function getGrade(score: number): { letter: string; color: string; bg: string } {
  if (score >= 80) return { letter: "A", color: "text-green-300", bg: "bg-green-500/15 border-green-500/30" };
  if (score >= 60) return { letter: "B", color: "text-yellow-300", bg: "bg-yellow-500/15 border-yellow-500/30" };
  if (score >= 40) return { letter: "C", color: "text-orange-300", bg: "bg-orange-500/15 border-orange-500/30" };
  return { letter: "D", color: "text-text-muted", bg: "bg-radar-elevated border-radar-border" };
}

// ─── Highlighted text renderer ────────────────────────────────────────────────

function HighlightedText({
  text,
  terms,
  className,
}: {
  text: string;
  terms: string[];
  className?: string;
}) {
  const segments = highlightTerms(text, terms);
  return (
    <span className={className}>
      {segments.map((seg, i) =>
        seg.isHighlight ? (
          <mark
            key={i}
            className="bg-yellow-400/25 text-yellow-200 rounded-sm px-0.5 not-italic"
          >
            {seg.text}
          </mark>
        ) : (
          <span key={i}>{seg.text}</span>
        )
      )}
    </span>
  );
}

// ─── Source chip ──────────────────────────────────────────────────────────────

const SOURCE_LABELS: Record<string, string> = {
  WATCHLIST: "Watchlist",
  GREENHOUSE: "Greenhouse",
  LEVER: "Lever",
  ASHBY: "Ashby",
};

const SOURCE_COLORS: Record<string, string> = {
  WATCHLIST: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  GREENHOUSE: "bg-green-500/10 text-green-400 border-green-500/20",
  LEVER: "bg-slate-500/10 text-slate-400 border-slate-500/20",
  ASHBY: "bg-purple-500/10 text-purple-400 border-purple-500/20",
};

// ─── Status selector ──────────────────────────────────────────────────────────

const STATUS_OPTIONS = [
  { value: "SAVED", label: "Save" },
  { value: "APPLIED", label: "Applied" },
  { value: "NOT_INTERESTED", label: "Pass" },
] as const;

function StatusSelector({
  postingId,
  currentStatus,
  onStatusChange,
}: {
  postingId: string;
  currentStatus: string;
  onStatusChange: (id: string, status: string) => void;
}) {
  const [pending, setPending] = useState<string | null>(null);

  const handleClick = async (status: string) => {
    // Toggle off — return to NEW if clicking active status
    const newStatus = currentStatus === status ? "NEW" : status;
    setPending(status);
    onStatusChange(postingId, newStatus);
    try {
      await fetch(`/api/jobs/${postingId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="flex items-center gap-1">
      {STATUS_OPTIONS.map((opt) => {
        const isActive = currentStatus === opt.value;
        return (
          <button
            key={opt.value}
            onClick={() => handleClick(opt.value)}
            disabled={pending !== null}
            className={cn(
              "px-2.5 py-1 rounded-md text-xs font-medium transition-all duration-150",
              isActive
                ? opt.value === "SAVED"
                  ? "bg-blue-500/20 text-blue-400 border border-blue-500/40"
                  : opt.value === "APPLIED"
                  ? "bg-green-500/20 text-green-400 border border-green-500/40"
                  : "bg-red-500/20 text-red-400 border border-red-500/40"
                : "bg-radar-elevated border border-radar-border text-text-muted hover:text-text-primary hover:border-[#2E3B55]",
              pending === opt.value && "opacity-50 cursor-not-allowed"
            )}
            data-testid={`status-${opt.value.toLowerCase()}-${postingId}`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Format helpers ───────────────────────────────────────────────────────────

function formatSalary(posting: JobPosting): string | null {
  if (posting.salary_raw) return posting.salary_raw;
  if (posting.salary_min && posting.salary_max) {
    const fmt = (n: number) =>
      n >= 1000 ? `$${(n / 1000).toFixed(0)}k` : `$${n.toLocaleString()}`;
    const currency = posting.salary_currency && posting.salary_currency !== "USD"
      ? ` ${posting.salary_currency}`
      : "";
    return `${fmt(posting.salary_min)} – ${fmt(posting.salary_max)}${currency}`;
  }
  if (posting.salary_min) return `$${posting.salary_min.toLocaleString()}+`;
  return null;
}

function formatPostedDate(posting: JobPosting): string {
  const dateStr = posting.posted_at || posting.first_seen_at;
  const date = new Date(dateStr);
  const days = Math.floor((Date.now() - date.getTime()) / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

// ─── Main card component ──────────────────────────────────────────────────────

interface JobCardProps {
  posting: JobPosting;
  highValueSkills: string[];
  highValueTitles: string[];
  onStatusChange: (id: string, status: string) => void;
}

export function JobCard({ posting, highValueSkills, highValueTitles, onStatusChange }: JobCardProps) {
  const [status, setStatus] = useState(posting.status);
  const grade = getGrade(posting.match_score);
  const salary = formatSalary(posting);
  const postedDate = formatPostedDate(posting);
  const highlightTermsList = [...highValueSkills, ...highValueTitles];

  const handleStatusChange = (id: string, newStatus: string) => {
    setStatus(newStatus as any);
    onStatusChange(id, newStatus);
  };

  // Left border by status
  const borderAccent =
    status === "APPLIED" ? "border-l-2 border-l-green-500/60" :
    status === "SAVED" ? "border-l-2 border-l-blue-500/60" :
    "";

  const EXP_LABELS: Record<string, string> = {
    ENTRY: "Entry", MID: "Mid", SENIOR: "Senior", STAFF: "Staff",
  };

  return (
    <article
      className={cn(
        "bg-radar-surface border border-radar-border rounded-2xl p-5 transition-all duration-200",
        "hover:border-[#2E3B55] hover:shadow-lg hover:shadow-black/20",
        borderAccent
      )}
      data-testid={`job-card-${posting.id}`}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <span className="text-xs font-medium text-text-secondary">{posting.company_name}</span>
            {posting.is_new_since_last_visit && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-blue-500/20 text-blue-400 border border-blue-500/30">
                NEW
              </span>
            )}
          </div>
          <h3 className="text-base font-semibold text-text-primary leading-snug" style={{ fontFamily: "Syne, sans-serif" }}>
            <HighlightedText text={posting.title} terms={highValueTitles} />
          </h3>
        </div>

        {/* Match score badge */}
        <div className={cn(
          "flex-shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-lg border font-mono text-sm font-semibold",
          grade.bg, grade.color
        )}>
          <span>{grade.letter}</span>
          <span className="text-[11px] opacity-70">·</span>
          <span>{posting.match_score}%</span>
        </div>
      </div>

      {/* Meta row */}
      <div className="flex flex-wrap items-center gap-1.5 mb-3">
        {posting.location && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] bg-radar-elevated border border-radar-border text-text-secondary">
            <svg className="w-2.5 h-2.5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
            </svg>
            {posting.location}
          </span>
        )}
        {posting.experience_level && (
          <span className="px-2 py-0.5 rounded-md text-[11px] bg-radar-elevated border border-radar-border text-text-secondary">
            {EXP_LABELS[posting.experience_level] ?? posting.experience_level}
          </span>
        )}
        {posting.role_category && (
          <span className="px-2 py-0.5 rounded-md text-[11px] bg-radar-elevated border border-radar-border text-text-secondary">
            {posting.role_category}
          </span>
        )}
        <span className={cn(
          "px-2 py-0.5 rounded-md text-[11px] border",
          SOURCE_COLORS[posting.source] ?? "bg-radar-elevated border-radar-border text-text-secondary"
        )}>
          {SOURCE_LABELS[posting.source] ?? posting.source}
        </span>
        <span className="px-2 py-0.5 rounded-md text-[11px] font-mono bg-radar-elevated border border-radar-border text-text-muted ml-auto">
          {postedDate}
        </span>
        {salary ? (
          <span className="px-2 py-0.5 rounded-md text-[11px] font-mono bg-green-500/8 border border-green-500/20 text-green-400">
            {salary}
          </span>
        ) : (
          <span className="text-[11px] text-text-muted font-mono">Salary not listed</span>
        )}
      </div>

      {/* Summary + match explanation */}
      {posting.description_summary && (
        <div className="mb-3 space-y-2">
          <p className="text-sm text-text-secondary leading-relaxed">
            <HighlightedText text={posting.description_summary} terms={highlightTermsList} />
          </p>
          {posting.match_explanation && (
            <p className="text-[13px] text-text-muted leading-relaxed flex gap-1.5">
              <span className="text-blue-400/60 flex-shrink-0 mt-px">✦</span>
              <HighlightedText text={posting.match_explanation} terms={highlightTermsList} />
            </p>
          )}
        </div>
      )}

      {/* Footer row */}
      <div className="flex items-center justify-between gap-3 pt-3 border-t border-radar-border/60">
        <StatusSelector
          postingId={posting.id}
          currentStatus={status}
          onStatusChange={handleStatusChange}
        />
        <a
          href={posting.apply_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-500/10 border border-blue-500/30 text-blue-400 hover:bg-blue-500/20 hover:border-blue-500/50 transition-all"
          data-testid={`button-apply-${posting.id}`}
        >
          View &amp; Apply
          <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
            <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" />
            <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" />
          </svg>
        </a>
      </div>
    </article>
  );
}
