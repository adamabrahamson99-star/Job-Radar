"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/utils";
import { TIER_COMPANY_LIMITS } from "@/lib/tier";
import {
  COMPANY_CATALOG,
  searchCatalog,
  getRecommendations,
  atsCareerUrl,
  type CatalogCompany,
} from "@/lib/company-catalog";
import type { Company } from "@/types/companies";

// ─── Utilities ────────────────────────────────────────────────────────────────

function RelativeTime({ iso }: { iso: string | null }) {
  if (!iso) return <span className="text-text-muted">Never</span>;
  const date = new Date(iso);
  const mins = Math.floor((Date.now() - date.getTime()) / 60000);
  const text =
    mins < 1 ? "Just now"
    : mins < 60 ? `${mins}m ago`
    : mins < 1440 ? `${Math.floor(mins / 60)}h ago`
    : `${Math.floor(mins / 1440)}d ago`;
  return <span title={date.toLocaleString()}>{text}</span>;
}

const ATS_BADGE: Record<string, { label: string; color: string }> = {
  GREENHOUSE: { label: "Greenhouse", color: "text-green-400 bg-green-500/10 border-green-500/20" },
  LEVER:      { label: "Lever",      color: "text-blue-400 bg-blue-500/10 border-blue-500/20" },
  ASHBY:      { label: "Ashby",      color: "text-purple-400 bg-purple-500/10 border-purple-500/20" },
};

// ─── Company card (catalog search result) ─────────────────────────────────────

interface CompanyCardProps {
  company: CatalogCompany;
  alreadyAdded: boolean;
  onAdd: (company: CatalogCompany) => void;
  adding: boolean;
}

function CompanyCard({ company, alreadyAdded, onAdd, adding }: CompanyCardProps) {
  const badge = company.ats_source ? ATS_BADGE[company.ats_source] : null;

  return (
    <div className={cn(
      "flex items-center justify-between gap-3 p-3 rounded-xl border transition-all",
      alreadyAdded
        ? "bg-radar-elevated border-radar-border opacity-60"
        : "bg-radar-surface border-radar-border hover:border-blue-500/30 hover:bg-radar-elevated/40"
    )}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-text-primary truncate">{company.name}</span>
          {badge && (
            <span className={cn("inline-flex items-center text-[10px] font-mono border rounded px-1.5 py-0.5 flex-shrink-0", badge.color)}>
              {badge.label}
            </span>
          )}
        </div>
        <p className="text-[11px] text-text-muted mt-0.5">{company.sector}</p>
      </div>

      {alreadyAdded ? (
        <span className="text-xs text-text-muted font-mono flex-shrink-0">Added</span>
      ) : (
        <button
          onClick={() => onAdd(company)}
          disabled={adding}
          className="flex-shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-500/10 border border-blue-500/25 text-blue-400 text-xs font-medium hover:bg-blue-500/20 transition-all disabled:opacity-50"
        >
          {adding ? (
            <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
            </svg>
          )}
          Add
        </button>
      )}
    </div>
  );
}

// ─── Add Company Panel ────────────────────────────────────────────────────────

interface AddCompanyPanelProps {
  companies: Company[];
  onClose: () => void;
  onAdded: (company: Company) => void;
}

function AddCompanyPanel({ companies, onClose, onAdded }: AddCompanyPanelProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CatalogCompany[]>([]);
  const [recommendations, setRecommendations] = useState<CatalogCompany[]>([]);
  const [addingSlug, setAddingSlug] = useState<string | null>(null);
  const [manualMode, setManualMode] = useState(false);

  // Manual add form state
  const [manualName, setManualName] = useState("");
  const [manualUrl, setManualUrl] = useState("");
  const [manualErrors, setManualErrors] = useState<Record<string, string>>({});
  const [manualSaving, setManualSaving] = useState(false);

  const existingNames = companies.map((c) => c.company_name);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Load recommendations (profile-based, client-side)
  useEffect(() => {
    let profileKeywords: string[] = [];
    fetch("/api/profile/get")
      .then((r) => r.json())
      .then((data) => {
        const profile = data.profile ?? {};
        profileKeywords = [
          ...(profile.target_roles ?? []),
          ...(profile.high_value_titles ?? []),
          ...(profile.skills ?? []).slice(0, 8),
        ].map((k: string) => k.toLowerCase());
        setRecommendations(getRecommendations(profileKeywords, existingNames, 12));
      })
      .catch(() => {
        setRecommendations(getRecommendations([], existingNames, 12));
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Search as user types
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    setResults(searchCatalog(query).slice(0, 15));
  }, [query]);

  // Focus search on mount
  useEffect(() => {
    setTimeout(() => searchInputRef.current?.focus(), 50);
  }, []);

  const addFromCatalog = async (catalog: CatalogCompany) => {
    setAddingSlug(catalog.slug);
    try {
      const body: Record<string, string> = { company_name: catalog.name };
      if (catalog.ats_source) {
        body.ats_source = catalog.ats_source;
        body.ats_slug   = catalog.ats_slug ?? "";
      } else if (catalog.career_url) {
        body.career_page_url = catalog.career_url;
      }

      const res = await fetch("/api/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok) {
        onAdded(data.company);
      } else {
        console.error("Add failed:", data.error);
      }
    } finally {
      setAddingSlug(null);
    }
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!manualName.trim()) errs.name = "Company name is required";
    if (!manualUrl.trim()) errs.url = "Career page URL is required";
    else { try { new URL(manualUrl); } catch { errs.url = "Enter a valid URL (include https://)"; } }
    if (Object.keys(errs).length) { setManualErrors(errs); return; }

    setManualSaving(true);
    try {
      const res = await fetch("/api/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_name: manualName.trim(), career_page_url: manualUrl.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        onAdded(data.company);
        onClose();
      } else {
        setManualErrors({ submit: data.error || "Failed to add company" });
      }
    } finally {
      setManualSaving(false);
    }
  };

  const displayList = query.trim() ? results : recommendations;
  const showingRecommended = !query.trim();

  return (
    <div className="mb-6 bg-radar-surface border border-radar-border rounded-2xl p-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-text-primary" style={{ fontFamily: "Syne, sans-serif" }}>
          Add Company
        </h3>
        <button onClick={onClose} className="p-1 rounded-lg text-text-muted hover:text-text-primary hover:bg-radar-elevated transition-all">
          <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </button>
      </div>

      {!manualMode ? (
        <>
          {/* Search input */}
          <div className="relative mb-4">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
            </svg>
            <input
              ref={searchInputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search companies — Netflix, Stripe, OpenAI..."
              className="w-full bg-radar-elevated border border-radar-border rounded-xl pl-9 pr-4 py-2.5 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:ring-1 focus:ring-blue-500/30 focus:border-blue-500/40 transition-colors"
              data-testid="input-company-search"
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary transition-colors"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            )}
          </div>

          {/* Results / Recommendations */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-text-muted font-mono">
                {showingRecommended
                  ? "RECOMMENDED FOR YOU"
                  : results.length > 0
                  ? `${results.length} RESULT${results.length !== 1 ? "S" : ""}`
                  : ""}
              </p>
              {showingRecommended && (
                <span className="text-[10px] text-text-muted font-mono flex items-center gap-1">
                  <svg className="w-3 h-3 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
                  </svg>
                  ATS-BACKED FIRST
                </span>
              )}
            </div>

            {query.trim() && results.length === 0 ? (
              <div className="text-center py-6 border border-dashed border-radar-border rounded-xl">
                <p className="text-sm text-text-secondary mb-1">No matches in our catalog</p>
                <p className="text-xs text-text-muted mb-3">
                  You can add any company manually with a custom career page URL.
                </p>
                <button
                  onClick={() => { setManualMode(true); setManualName(query); }}
                  className="text-xs text-blue-400 hover:text-blue-300 transition-colors underline underline-offset-2"
                >
                  Add &quot;{query}&quot; manually →
                </button>
              </div>
            ) : (
              <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                {displayList.map((c) => (
                  <CompanyCard
                    key={`${c.ats_source ?? "url"}-${c.slug}`}
                    company={c}
                    alreadyAdded={existingNames.some(
                      (n) => n.toLowerCase() === c.name.toLowerCase()
                    )}
                    onAdd={addFromCatalog}
                    adding={addingSlug === c.slug}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Manual add link */}
          <div className="mt-4 pt-3 border-t border-radar-border">
            <button
              onClick={() => setManualMode(true)}
              className="text-xs text-text-muted hover:text-text-secondary transition-colors"
            >
              Don&apos;t see your company?{" "}
              <span className="text-blue-400 hover:text-blue-300 underline underline-offset-2">
                Add manually with a URL →
              </span>
            </button>
          </div>
        </>
      ) : (
        /* Manual add form */
        <div>
          <button
            onClick={() => { setManualMode(false); setManualName(""); setManualUrl(""); setManualErrors({}); }}
            className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-secondary mb-4 transition-colors"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
            Back to search
          </button>

          {manualErrors.submit && (
            <div className="mb-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              {manualErrors.submit}
            </div>
          )}

          <form onSubmit={handleManualSubmit} className="space-y-3">
            <Input
              label="Company name"
              placeholder="Acme Corp"
              value={manualName}
              onChange={(e) => { setManualName(e.target.value); setManualErrors((x) => ({ ...x, name: "" })); }}
              error={manualErrors.name}
              autoFocus
              data-testid="input-company-name"
            />
            <Input
              label="Career page URL"
              type="url"
              placeholder="https://acme.com/careers"
              value={manualUrl}
              onChange={(e) => { setManualUrl(e.target.value); setManualErrors((x) => ({ ...x, url: "" })); }}
              error={manualErrors.url}
              hint="The page where their open roles are listed"
              data-testid="input-career-url"
            />
            <div className="flex gap-2 pt-1">
              <Button variant="ghost" size="sm" type="button" onClick={() => setManualMode(false)} className="flex-1">
                Cancel
              </Button>
              <Button type="submit" size="sm" loading={manualSaving} className="flex-1" data-testid="button-save-company">
                Add company
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

// ─── Edit URL modal (unchanged) ───────────────────────────────────────────────

interface EditUrlModalProps {
  company: Company;
  onClose: () => void;
  onSave: (id: string, url: string) => Promise<void>;
}

function EditUrlModal({ company, onClose, onSave }: EditUrlModalProps) {
  const [url, setUrl] = useState(company.career_page_url);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try { new URL(url); } catch { setError("Enter a valid URL"); return; }
    setSaving(true);
    try {
      await onSave(company.id, url.trim());
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to update");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-radar-surface border border-radar-border rounded-2xl w-full max-w-md p-6 shadow-2xl animate-fade-in">
        <h2 className="text-lg font-bold text-text-primary mb-4" style={{ fontFamily: "Syne, sans-serif" }}>
          Edit URL — {company.company_name}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Career page URL"
            type="url"
            value={url}
            onChange={(e) => { setUrl(e.target.value); setError(""); }}
            error={error}
            autoFocus
          />
          <div className="flex gap-3">
            <Button variant="ghost" type="button" onClick={onClose} className="flex-1">Cancel</Button>
            <Button type="submit" loading={saving} className="flex-1">Save</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── WatchlistTab ─────────────────────────────────────────────────────────────

interface WatchlistTabProps {
  tier: string;
}

export function WatchlistTab({ tier }: WatchlistTabProps) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [manualCheckLoading, setManualCheckLoading] = useState(false);
  const [manualCheckResult, setManualCheckResult] = useState<string | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
  }, []);

  const limit = TIER_COMPANY_LIMITS[tier] ?? 3;
  const atLimit = limit !== Infinity && companies.length >= limit;

  const fetchCompanies = useCallback(async () => {
    try {
      const res = await fetch("/api/companies");
      const data = await res.json();
      setCompanies(data.companies ?? []);
    } catch (err) {
      console.error("Failed to fetch companies:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchCompanies(); }, [fetchCompanies]);

  const handleToggle = async (company: Company) => {
    setTogglingId(company.id);
    try {
      const res = await fetch(`/api/companies/${company.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !company.is_active }),
      });
      const data = await res.json();
      if (res.ok) setCompanies((prev) => prev.map((c) => c.id === company.id ? data.company : c));
    } finally {
      setTogglingId(null);
    }
  };

  const handleEditUrl = async (id: string, url: string) => {
    const res = await fetch(`/api/companies/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ career_page_url: url }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to update");
    setCompanies((prev) => prev.map((c) => c.id === id ? data.company : c));
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Remove this company from your watchlist?")) return;
    setDeletingId(id);
    try {
      await fetch(`/api/companies/${id}`, { method: "DELETE" });
      setCompanies((prev) => prev.filter((c) => c.id !== id));
    } finally {
      setDeletingId(null);
    }
  };

  const handleManualCheck = async () => {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    setManualCheckLoading(true);
    setManualCheckResult(null);

    try {
      const res = await fetch("/api/jobs/manual-check", { method: "POST" });
      const data = await res.json();

      if (res.status === 429) {
        setManualCheckResult(`⚠ ${data.error}`);
        setManualCheckLoading(false);
        return;
      }
      if (!res.ok || !data.ok) {
        setManualCheckResult(`Error: ${data.error ?? "Unknown error"}`);
        setManualCheckLoading(false);
        return;
      }

      const { job_id, checks_remaining } = data;
      if (!job_id) {
        setManualCheckResult("Check failed — FastAPI backend may not be running.");
        setManualCheckLoading(false);
        return;
      }

      setManualCheckResult("⏳ Scanning your watchlist…");
      let polls = 0;
      const MAX_POLLS = 150;

      pollIntervalRef.current = setInterval(async () => {
        polls++;
        if (polls > MAX_POLLS) {
          clearInterval(pollIntervalRef.current!);
          setManualCheckLoading(false);
          setManualCheckResult("⚠ Check is taking longer than expected — still running in the background. Refresh in a few minutes.");
          return;
        }
        try {
          const statusRes = await fetch(`/api/jobs/check-status/${job_id}`);
          const statusData = await statusRes.json();
          if (statusData.status === "running") return;

          clearInterval(pollIntervalRef.current!);
          setManualCheckLoading(false);
          await fetchCompanies();

          if (statusData.status === "complete") {
            const found = statusData.result?.new_postings ?? 0;
            setManualCheckResult(
              `✓ Check complete — ${found} new posting${found !== 1 ? "s" : ""} found.` +
              (checks_remaining < 999 ? ` ${checks_remaining} check${checks_remaining !== 1 ? "s" : ""} remaining this month.` : "")
            );
          } else if (statusData.status === "lost") {
            setManualCheckResult("✓ Check finished — refresh the job feed to see new results.");
          } else {
            setManualCheckResult(`Error: ${statusData.error ?? "Check failed"}`);
          }
        } catch { /* transient network error — keep polling */ }
      }, 4000);
    } catch {
      setManualCheckResult("Check failed — FastAPI backend may not be running.");
      setManualCheckLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div>
      {/* Header row */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <span className="text-sm text-text-secondary font-mono">
            {companies.length}{limit !== Infinity ? `/${limit}` : ""} companies
          </span>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleManualCheck}
            loading={manualCheckLoading}
            data-testid="button-manual-check"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
            </svg>
            Run check
          </Button>
        </div>

        <Button
          size="sm"
          onClick={() => setShowAddPanel((v) => !v)}
          disabled={atLimit}
          data-testid="button-add-company"
        >
          {showAddPanel ? (
            <>
              <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M14.707 12.293a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L9 14.586V3a1 1 0 012 0v11.586l2.293-2.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              Close
            </>
          ) : (
            <>
              <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
              </svg>
              Add company
            </>
          )}
        </Button>
      </div>

      {/* Manual check result */}
      {manualCheckResult && (
        <div className={cn(
          "mb-4 p-3 rounded-lg border text-sm",
          manualCheckResult.startsWith("✓")
            ? "bg-green-500/10 border-green-500/20 text-green-400"
            : manualCheckResult.startsWith("⚠")
            ? "bg-yellow-500/10 border-yellow-500/20 text-yellow-400"
            : "bg-red-500/10 border-red-500/20 text-red-400"
        )}>
          {manualCheckResult}
        </div>
      )}

      {/* Tier limit warning */}
      {atLimit && (
        <div className="mb-4 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 text-sm flex items-center gap-2">
          <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
          </svg>
          Company limit reached ({limit}/{limit}). Upgrade to add more companies.
        </div>
      )}

      {/* Add company panel (inline, replaces old modal) */}
      {showAddPanel && !atLimit && (
        <AddCompanyPanel
          companies={companies}
          onClose={() => setShowAddPanel(false)}
          onAdded={(company) => {
            setCompanies((prev) => [company, ...prev]);
            setShowAddPanel(false);
          }}
        />
      )}

      {/* Empty state */}
      {companies.length === 0 && !showAddPanel && (
        <div className="text-center py-16 border border-dashed border-radar-border rounded-2xl">
          <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-radar-elevated border border-radar-border flex items-center justify-center">
            <svg className="w-6 h-6 text-text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
          </div>
          <p className="text-text-primary font-medium mb-1">No companies yet</p>
          <p className="text-sm text-text-secondary mb-4">Add companies to monitor their career pages</p>
          <Button size="sm" onClick={() => setShowAddPanel(true)}>Add first company</Button>
        </div>
      )}

      {/* Company table */}
      {companies.length > 0 && (
        <div className="bg-radar-surface border border-radar-border rounded-2xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-radar-border">
                {["Company", "Status", "Last checked", "Postings", "Actions"].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-[11px] font-mono text-text-muted uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-radar-border">
              {companies.map((company) => {
                const atsBadge = (company as any).ats_source ? ATS_BADGE[(company as any).ats_source] : null;
                return (
                  <tr key={company.id} className="hover:bg-radar-elevated/30 transition-colors group">
                    <td className="px-4 py-3.5">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-text-primary">{company.company_name}</p>
                          {atsBadge && (
                            <span className={cn("inline-flex items-center text-[10px] font-mono border rounded px-1.5 py-0.5", atsBadge.color)}>
                              {atsBadge.label}
                            </span>
                          )}
                        </div>
                        <a
                          href={company.career_page_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-text-muted hover:text-blue-400 transition-colors truncate block max-w-[240px]"
                        >
                          {company.career_page_url}
                        </a>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <button
                        onClick={() => handleToggle(company)}
                        disabled={togglingId === company.id}
                        className="flex items-center gap-2"
                        data-testid={`toggle-company-${company.id}`}
                      >
                        <div className={cn(
                          "w-8 h-4 rounded-full transition-all duration-200 relative",
                          company.is_active ? "bg-blue-500" : "bg-radar-elevated border border-radar-border"
                        )}>
                          <div className={cn(
                            "absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all duration-200",
                            company.is_active ? "left-4" : "left-0.5"
                          )} />
                        </div>
                        <span className={cn("text-xs", company.is_active ? "text-blue-400" : "text-text-muted")}>
                          {company.is_active ? "Active" : "Paused"}
                        </span>
                      </button>
                    </td>
                    <td className="px-4 py-3.5 text-sm text-text-secondary">
                      <RelativeTime iso={company.last_checked_at} />
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="font-mono text-sm text-text-primary">{company.posting_count}</span>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => setEditingCompany(company)}
                          className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-radar-elevated transition-all"
                          title="Edit URL"
                          data-testid={`button-edit-${company.id}`}
                        >
                          <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleDelete(company.id)}
                          disabled={deletingId === company.id}
                          className="p-1.5 rounded-lg text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-all"
                          title="Remove company"
                          data-testid={`button-delete-${company.id}`}
                        >
                          <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {editingCompany && (
        <EditUrlModal
          company={editingCompany}
          onClose={() => setEditingCompany(null)}
          onSave={handleEditUrl}
        />
      )}
    </div>
  );
}
