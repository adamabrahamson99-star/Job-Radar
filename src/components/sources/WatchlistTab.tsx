"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/utils";
import { TIER_COMPANY_LIMITS } from "@/lib/tier";
import type { Company } from "@/types/companies";

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

interface AddCompanyModalProps {
  onClose: () => void;
  onSave: (name: string, url: string) => Promise<void>;
}

function AddCompanyModal({ onClose, onSave }: AddCompanyModalProps) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = "Company name is required";
    if (!url.trim()) errs.url = "Career page URL is required";
    else {
      try { new URL(url); } catch { errs.url = "Enter a valid URL (include https://)"; }
    }
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }

    setSaving(true);
    try {
      await onSave(name.trim(), url.trim());
      onClose();
    } catch (err: any) {
      setErrors({ submit: err.message || "Failed to add company" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-radar-surface border border-radar-border rounded-2xl w-full max-w-md p-6 shadow-2xl animate-fade-in">
        <h2 className="text-lg font-bold text-text-primary mb-5" style={{ fontFamily: "Syne, sans-serif" }}>
          Add company to watchlist
        </h2>

        {errors.submit && (
          <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            {errors.submit}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Company name"
            placeholder="Acme Corp"
            value={name}
            onChange={(e) => { setName(e.target.value); setErrors((x) => ({ ...x, name: "" })); }}
            error={errors.name}
            autoFocus
            data-testid="input-company-name"
          />
          <Input
            label="Career page URL"
            type="url"
            placeholder="https://acme.com/careers"
            value={url}
            onChange={(e) => { setUrl(e.target.value); setErrors((x) => ({ ...x, url: "" })); }}
            error={errors.url}
            hint="The page where their open roles are listed"
            data-testid="input-career-url"
          />
          <div className="flex gap-3 pt-2">
            <Button variant="ghost" size="md" type="button" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button type="submit" size="md" loading={saving} className="flex-1" data-testid="button-save-company">
              Add company
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

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

interface WatchlistTabProps {
  tier: string;
}

export function WatchlistTab({ tier }: WatchlistTabProps) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [manualCheckLoading, setManualCheckLoading] = useState(false);
  const [manualCheckResult, setManualCheckResult] = useState<string | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Clear polling on unmount
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

  const handleAdd = async (name: string, url: string) => {
    const res = await fetch("/api/companies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ company_name: name, career_page_url: url }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to add company");
    setCompanies((prev) => [data.company, ...prev]);
  };

  const handleToggle = async (company: Company) => {
    setTogglingId(company.id);
    try {
      const res = await fetch(`/api/companies/${company.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !company.is_active }),
      });
      const data = await res.json();
      if (res.ok) {
        setCompanies((prev) => prev.map((c) => c.id === company.id ? data.company : c));
      }
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

      // No job_id means the backend isn't running
      if (!job_id) {
        setManualCheckResult("Check failed — FastAPI backend may not be running.");
        setManualCheckLoading(false);
        return;
      }

      setManualCheckResult("⏳ Scanning your watchlist…");

      // Poll /api/jobs/check-status/{job_id} every 4 seconds
      let polls = 0;
      const MAX_POLLS = 150; // 10 minutes

      pollIntervalRef.current = setInterval(async () => {
        polls++;
        if (polls > MAX_POLLS) {
          clearInterval(pollIntervalRef.current!);
          setManualCheckLoading(false);
          setManualCheckResult("⚠ Check is taking longer than expected — it's still running in the background. Refresh the page in a few minutes.");
          return;
        }

        try {
          const statusRes = await fetch(`/api/jobs/check-status/${job_id}`);
          const statusData = await statusRes.json();

          if (statusData.status === "running") return; // still going, keep polling

          clearInterval(pollIntervalRef.current!);
          setManualCheckLoading(false);
          await fetchCompanies();

          if (statusData.status === "complete") {
            const found = statusData.result?.new_postings ?? 0;
            const remaining = checks_remaining;
            setManualCheckResult(
              `✓ Check complete — ${found} new posting${found !== 1 ? "s" : ""} found.` +
              (remaining < 999 ? ` ${remaining} check${remaining !== 1 ? "s" : ""} remaining this month.` : "")
            );
          } else if (statusData.status === "lost") {
            // FastAPI restarted mid-check — job may have partially completed
            setManualCheckResult("✓ Check finished — refresh the job feed to see new results.");
          } else {
            setManualCheckResult(`Error: ${statusData.error ?? "Check failed"}`);
          }
        } catch {
          // Transient network error — keep polling
        }
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
          onClick={() => setShowAddModal(true)}
          disabled={atLimit}
          data-testid="button-add-company"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
          </svg>
          Add company
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

      {/* Empty state */}
      {companies.length === 0 && (
        <div className="text-center py-16 border border-dashed border-radar-border rounded-2xl">
          <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-radar-elevated border border-radar-border flex items-center justify-center">
            <svg className="w-6 h-6 text-text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
          </div>
          <p className="text-text-primary font-medium mb-1">No companies yet</p>
          <p className="text-sm text-text-secondary mb-4">Add companies to monitor their career pages</p>
          <Button size="sm" onClick={() => setShowAddModal(true)}>Add first company</Button>
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
              {companies.map((company) => (
                <tr key={company.id} className="hover:bg-radar-elevated/30 transition-colors group">
                  <td className="px-4 py-3.5">
                    <div>
                      <p className="text-sm font-medium text-text-primary">{company.company_name}</p>
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
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showAddModal && (
        <AddCompanyModal onClose={() => setShowAddModal(false)} onSave={handleAdd} />
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
